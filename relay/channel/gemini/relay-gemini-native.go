package gemini

import (
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

func GeminiTextGenerationHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	// 读取响应体
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	logger.LogDebug(c, "Gemini native response body: %s", responseBody)
	responseBody, envelopeErr := prepareGeminiDocument(responseBody)
	if envelopeErr != nil {
		return nil, envelopeErr
	}

	// 解析为 Gemini 原生响应格式
	var geminiResponse dto.GeminiChatResponse
	err = common.Unmarshal(responseBody, &geminiResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	info.ObserveResponseModel(gjson.GetBytes(responseBody, "modelVersion").Str)
	var grounding geminiGroundingCounter
	grounding.observe(&geminiResponse)
	grounding.commit(info)
	countGeminiBillableFunctionCalls(info, &geminiResponse)

	if len(geminiResponse.Candidates) == 0 && geminiResponse.PromptFeedback != nil && geminiResponse.PromptFeedback.BlockReason != nil {
		info.PerformanceBusinessRejection = true
		common.SetContextKey(c, constant.ContextKeyAdminRejectReason, fmt.Sprintf("gemini_block_reason=%s", *geminiResponse.PromptFeedback.BlockReason))
	}

	// 计算使用量（优先上游 UsageMetadata，缺失时本地估算并保留 Gemini 计费语义）
	usage := buildUsageFromGeminiResponse(c, info, &geminiResponse)

	service.IOCopyBytesGracefully(c, resp, sanitizeNativeGeminiBody(responseBody))

	return &usage, nil
}

func NativeGeminiEmbeddingHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	logger.LogDebug(c, "Gemini native embedding response body: %s", responseBody)
	if envelopeErr := geminiEmbeddingError(responseBody, info.IsGeminiBatchEmbedding); envelopeErr != nil {
		return nil, envelopeErr
	}

	usage := service.ResponseText2Usage(c, "", info.UpstreamModelName, info.GetEstimatePromptTokens())

	if info.IsGeminiBatchEmbedding {
		var geminiResponse dto.GeminiBatchEmbeddingResponse
		err = common.Unmarshal(responseBody, &geminiResponse)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
	} else {
		var geminiResponse dto.GeminiEmbeddingResponse
		err = common.Unmarshal(responseBody, &geminiResponse)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
	}

	service.IOCopyBytesGracefully(c, resp, sanitizeNativeGeminiEmbeddingBody(responseBody))

	return usage, nil
}

func GeminiTextGenerationStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	helper.SetEventStreamHeaders(c)

	var pending string
	var counts map[string]int64
	write := func(frame string) error {
		if err := helper.StringData(c, frame); err != nil {
			return err
		}
		info.SendResponseCount++
		return nil
	}
	usage, apiErr := geminiStreamHandler(c, info, resp, func(data string, _ *dto.GeminiChatResponse) bool {
		if pending != "" {
			if err := write(pending); err != nil {
				pending = ""
				return false
			}
		}
		pending = string(sanitizeNativeGemini([]byte(data), false))
		if metadata := gjson.Get(data, "usageMetadata"); metadata.IsObject() {
			if counts == nil {
				counts = make(map[string]int64)
			}
			for name := range geminiUsageKeys {
				if value := metadata.Get(name); value.Type == gjson.Number {
					counts[name] = value.Int()
				}
			}
		}
		return true
	})
	if pending != "" && !isGeminiDownstreamStop(c, info) {
		if apiErr == nil && counts != nil {
			encoded, err := common.Marshal(counts)
			if err != nil {
				return usage, types.NewError(err, types.ErrorCodeJsonMarshalFailed)
			}
			pending, err = sjson.SetRaw(pending, "usageMetadata", string(encoded))
			if err != nil {
				return usage, types.NewError(err, types.ErrorCodeJsonMarshalFailed)
			}
		}
		if err := write(pending); err != nil && apiErr == nil {
			apiErr = types.NewError(err, types.ErrorCodeBadResponseBody)
		}
	}
	if apiErr != nil && c.Writer.Written() {
		types.ErrOptionWithSkipRetry()(apiErr)
	}
	return usage, apiErr
}
