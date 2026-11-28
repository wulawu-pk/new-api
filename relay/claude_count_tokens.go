package relay

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/claude"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/sjson"
)

// countTokensMaxResponseBytes bounds the upstream answer; a token count is a
// few dozen bytes.
const countTokensMaxResponseBytes = 64 << 10

// ClaudeCountTokensHelper answers Anthropic's POST /v1/messages/count_tokens
// for Anthropic-type channels by asking the channel's own endpoint, so the
// count matches what the model will be billed for. The endpoint is free on the
// Anthropic API and upstream, so nothing is pre-consumed, charged or logged as
// usage. Only the public schema field input_tokens is returned to the caller.
func ClaudeCountTokensHelper(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	info.InitChannelMeta(c)
	if info.ChannelType != constant.ChannelTypeAnthropic {
		// Counting is only possible where the count comes from the model itself.
		// Guessing it locally would give the customer a number their bill does
		// not match, so say plainly that this model cannot be counted.
		return types.NewErrorWithStatusCode(
			errors.New(i18n.T(c, i18n.MsgRelayCountTokensUnavailable, map[string]any{"Model": info.OriginModelName})),
			types.ErrorCodeInvalidRequest, http.StatusNotFound, types.ErrOptionWithSkipRetry())
	}

	request, ok := info.Request.(*dto.ClaudeRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type %T", info.Request),
			types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	copied, err := common.DeepCopy(request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	if err := helper.ModelMappedHelper(c, info, copied); err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}

	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	body, err := storage.Bytes()
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	// Forward the client's body unchanged apart from the (possibly mapped)
	// model name, as the upstream counts exactly what it is given.
	if info.IsModelMapped {
		if body, err = sjson.SetBytes(body, "model", info.UpstreamModelName); err != nil {
			return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
		}
	}

	requestURL, err := countTokensURL(info)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, requestURL, bytes.NewReader(body))
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	adaptor := &claude.Adaptor{}
	headers := upstreamReq.Header
	if err := adaptor.SetupRequestHeader(c, &headers, info); err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	headers.Set("Content-Type", "application/json")
	headers.Set("Accept", "application/json")
	if err := channel.ApplyHeaderOverride(info, c, upstreamReq); err != nil {
		return types.NewError(err, types.ErrorCodeChannelHeaderOverrideInvalid, types.ErrOptionWithSkipRetry())
	}

	client, err := service.GetHttpClientWithProxySettings(info.ChannelSetting.Proxy, info.ChannelSetting)
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
	}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed, types.ErrOptionWithHideErrMsg("upstream error: do request failed"))
	}
	if resp.StatusCode != http.StatusOK {
		return service.RelayErrorHandler(c.Request.Context(), resp, false)
	}
	defer service.CloseResponseBodyGracefully(resp)
	raw, err := io.ReadAll(io.LimitReader(resp.Body, countTokensMaxResponseBytes))
	if err != nil {
		return types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	var parsed struct {
		InputTokens *int `json:"input_tokens"`
	}
	if err := common.Unmarshal(raw, &parsed); err != nil || parsed.InputTokens == nil || *parsed.InputTokens < 0 {
		e := types.NewError(fmt.Errorf("unexpected count_tokens response: %s", common.LocalLogPreview(string(raw))), types.ErrorCodeBadResponseBody)
		e.MarkUpstream()
		return e
	}
	c.JSON(http.StatusOK, gin.H{"input_tokens": *parsed.InputTokens})
	return nil
}

func countTokensURL(info *relaycommon.RelayInfo) (string, error) {
	base := strings.TrimRight(info.ChannelBaseUrl, "/")
	parsed, err := url.Parse(base + "/v1/messages/count_tokens")
	if err != nil {
		return "", err
	}
	if info.IsClaudeBetaQuery || info.ChannelOtherSettings.ClaudeBetaQuery {
		q := parsed.Query()
		q.Set("beta", "true")
		parsed.RawQuery = q.Encode()
	}
	return parsed.String(), nil
}
