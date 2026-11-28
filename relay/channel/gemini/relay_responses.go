package gemini

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

func GeminiResponsesHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	logger.LogDebug(c, "Gemini responses response body: %s", responseBody)
	responseBody, envelopeErr := prepareGeminiDocument(responseBody)
	if envelopeErr != nil {
		return nil, envelopeErr
	}

	var geminiResponse dto.GeminiChatResponse
	if err := common.Unmarshal(responseBody, &geminiResponse); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	info.ObserveResponseModel(gjson.GetBytes(responseBody, "modelVersion").Str)
	var grounding geminiGroundingCounter
	grounding.observe(&geminiResponse)
	grounding.commit(info)
	countGeminiBillableFunctionCalls(info, &geminiResponse)
	if len(geminiResponse.Candidates) == 0 {
		usage := buildUsageFromGeminiResponse(c, info, &geminiResponse)
		if geminiResponse.PromptFeedback != nil && geminiResponse.PromptFeedback.BlockReason != nil {
			info.PerformanceBusinessRejection = true
			common.SetContextKey(c, constant.ContextKeyAdminRejectReason, fmt.Sprintf("gemini_block_reason=%s", *geminiResponse.PromptFeedback.BlockReason))
			blocked := types.NewOpenAIError(
				errors.New("request blocked by Gemini API: "+publicBlockReason(*geminiResponse.PromptFeedback.BlockReason)),
				types.ErrorCodePromptBlocked,
				http.StatusBadRequest,
			)
			blocked.MarkUpstream()
			return &usage, blocked
		}
		common.SetContextKey(c, constant.ContextKeyAdminRejectReason, "gemini_empty_candidates")
		return &usage, types.NewOpenAIError(
			errors.New("empty response from Gemini API"),
			types.ErrorCodeEmptyResponse,
			http.StatusInternalServerError,
		)
	}

	usage := buildUsageFromGeminiResponse(c, info, &geminiResponse)

	convertResult, err := service.ConvertResponse(c, info, types.RelayFormatOpenAIResponses, &geminiResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	responsesResp, ok := convertResult.Value.(*dto.OpenAIResponsesResponse)
	if !ok {
		return nil, types.NewOpenAIError(fmt.Errorf("expected OpenAI responses response, got %T", convertResult.Value), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if responseID := helper.GetResponseID(c); responseID != "" {
		responsesResp.ID = responseID
	}
	responsesResp.Model = info.UpstreamModelName
	responsesResp.Usage = relayconvert.UsageFromChatUsage(&usage)

	responseBody, err = common.Marshal(responsesResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	responseBody = helper.SanitizeResponsesUsageAt(responseBody, "usage")
	service.IOCopyBytesGracefully(c, resp, responseBody)
	return &usage, nil
}

func GeminiResponsesStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	responseID := helper.GetResponseID(c)
	created := common.GetTimestamp()
	state, err := relayconvert.NewResponseStreamState(types.RelayFormatGemini, types.RelayFormatOpenAIResponses, relayconvert.ResponseStreamOptions{
		ID:                 responseID,
		Model:              info.UpstreamModelName,
		Created:            created,
		EmitSequenceNumber: true,
	})
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	hostedBridge := relayconvert.NewGeminiHostedStreamBridge()
	var streamErr *types.NewAPIError

	sendEvent := func(event relayconvert.ChatToResponsesStreamEvent) bool {
		data, err := common.Marshal(event.Payload)
		if err != nil {
			streamErr = types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
			return false
		}
		data = helper.SanitizeResponsesUsageAt(data, "response.usage")
		if err := helper.ResponseChunkData(c, dto.ResponsesStreamResponse{Type: event.Type}, string(data)); err != nil {
			if info.StreamStatus != nil {
				info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonClientGone, err)
			}
			return false
		}
		if event.Type == "response.failed" {
			common.SetContextKey(c, constant.ContextKeyStreamFailureSent, true)
		}
		info.SendResponseCount++
		return true
	}
	failResponsesStream := func(err error) bool {
		if info.SendResponseCount == 0 && !c.Writer.Written() {
			return false
		}
		// The customer sees neutral text; the cause stays in the server log.
		logger.LogError(c, common.LogText("gemini responses stream failed: %s", err.Error()))
		failureResults, handled := state.FailResponsesStream("server_error", publicStreamFailureMessage(c, err), "")
		if !handled {
			return false
		}
		for _, result := range failureResults {
			event, ok := result.Value.(relayconvert.ChatToResponsesStreamEvent)
			if !ok {
				streamErr = types.NewOpenAIError(fmt.Errorf("expected OAI responses stream event, got %T", result.Value), types.ErrorCodeBadResponse, http.StatusInternalServerError)
				return true
			}
			if !sendEvent(event) {
				return true
			}
		}
		return true
	}
	sendChunk := func(chunk *dto.GeminiChatResponse) bool {
		results, err := service.ConvertStreamResponseChunk(c, info, state, chunk)
		if err != nil {
			streamErr = types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
			return false
		}
		for _, result := range results {
			event, ok := result.Value.(relayconvert.ChatToResponsesStreamEvent)
			if !ok {
				streamErr = types.NewOpenAIError(fmt.Errorf("expected OAI responses stream event, got %T", result.Value), types.ErrorCodeBadResponse, http.StatusInternalServerError)
				return false
			}
			if !sendEvent(event) {
				return false
			}
		}
		return true
	}

	usage, streamAPIError := geminiStreamHandler(c, info, resp, func(_ string, geminiResponse *dto.GeminiChatResponse) bool {
		hostedBridge.Observe(geminiResponse)
		return sendChunk(geminiResponse)
	})
	if streamErr != nil {
		streamAPIError = streamErr
	}
	if streamAPIError != nil {
		failResponsesStream(streamAPIError)
		if c.Writer.Written() {
			types.ErrOptionWithSkipRetry()(streamAPIError)
		}
		return usage, streamAPIError
	}
	if isGeminiDownstreamStop(c, info) {
		return usage, nil
	}
	hostedEvents, err := hostedBridge.Finalize(state)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	for _, event := range hostedEvents {
		if !sendEvent(event) {
			if streamErr != nil {
				return usage, streamErr
			}
			return usage, nil
		}
	}

	if usage != nil {
		state.SetUsage(usage)
	}
	finalResults, err := service.FinalizeStreamResponse(c, info, state)
	if err != nil {
		failResponsesStream(err)
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	for _, result := range finalResults {
		event, ok := result.Value.(relayconvert.ChatToResponsesStreamEvent)
		if !ok {
			return nil, types.NewOpenAIError(fmt.Errorf("expected OAI responses stream event, got %T", result.Value), types.ErrorCodeBadResponse, http.StatusInternalServerError)
		}
		if !sendEvent(event) {
			if streamErr != nil {
				return usage, streamErr
			}
			return usage, nil
		}
	}
	return usage, nil
}
