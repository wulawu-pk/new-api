package service

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// peroai fork: customers must not learn who the upstream is or how it is
// run (account pools, balances, its CDN). Upstream errors are therefore
// rewritten into neutral messages where they leave the relay: the client
// response and the customer-visible error log. Retry, auto-disable and the
// admin log keep the original error, which is only replaced at those exits.

// localErrorCodes are produced by new-api itself and stay unchanged even when
// they ride on an OpenAI-shaped error.
var localErrorCodes = map[types.ErrorCode]bool{
	types.ErrorCodeInsufficientUserQuota:      true,
	types.ErrorCodePreConsumeTokenQuotaFailed: true,
	types.ErrorCodeInvalidRequest:             true,
	types.ErrorCodeSensitiveWordsDetected:     true,
	types.ErrorCodeCountTokenFailed:           true,
	types.ErrorCodeModelPriceError:            true,
	types.ErrorCodeReadRequestBodyFailed:      true,
	types.ErrorCodeConvertRequestFailed:       true,
	types.ErrorCodeBadRequestBody:             true,
	types.ErrorCodeAccessDenied:               true,
	types.ErrorCodePromptBlocked:              true,
	types.ErrorCodeGetChannelFailed:           true,
	types.ErrorCodeGenRelayInfoFailed:         true,
}

// IsUpstreamError reports whether err carries text that came from an upstream.
func IsUpstreamError(err *types.NewAPIError) bool {
	if err == nil || err.IsPublic() {
		return false
	}
	if err.IsUpstream() {
		return true
	}
	code := err.GetErrorCode()
	if localErrorCodes[code] || strings.HasPrefix(string(code), "channel:") || IsViolationFeeCode(code) {
		return false
	}
	switch err.GetErrorType() {
	case types.ErrorTypeOpenAIError, types.ErrorTypeClaudeError, types.ErrorTypeGeminiError,
		types.ErrorTypeRerankError, types.ErrorTypeUpstreamError, types.ErrorTypeMidjourneyError:
		return true
	}
	return false
}

var (
	upstreamURLPattern       = regexp.MustCompile(`(?i)\b(?:https?|wss?)://\S+`)
	upstreamEmailPattern     = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	upstreamRequestIDPattern = regexp.MustCompile(`(?i)\s*\((?:request|req|trace)[ _-]?id:?[^)]*\)`)
	upstreamLongIDPattern    = regexp.MustCompile(`\b[A-Za-z0-9_-]{24,}\b`)
	upstreamHTMLPattern      = regexp.MustCompile(`(?i)<\s*(?:html|!doctype|head|body|title)\b`)
	upstreamSpacePattern     = regexp.MustCompile(`\s{2,}`)
)

// upstreamIdentityWords mark a message that talks about how the upstream is
// operated rather than about the customer's request.
var upstreamIdentityWords = []string{
	"supergpt", "sub2api", "cloudflare", "origin web server", "cf-ray", "account", "channel", "group", "balance",
	"quota", "credit", "api key", "apikey", "api_key", "token is invalid", "subscription", "billing",
	"proxy", "kiro", "ccmax", "账号", "账户", "帐号", "余额", "额度", "渠道", "分组", "号池", "上游", "密钥", "令牌",
}

// scrubUpstreamText keeps a request-level upstream message (bad parameter,
// context too long, unsupported endpoint) when it reveals nothing about the
// upstream, and reports false otherwise.
func scrubUpstreamText(message string) (string, bool) {
	if upstreamHTMLPattern.MatchString(message) {
		return "", false
	}
	text := upstreamRequestIDPattern.ReplaceAllString(message, "")
	text = upstreamURLPattern.ReplaceAllString(text, "")
	text = upstreamEmailPattern.ReplaceAllString(text, "")
	text = upstreamLongIDPattern.ReplaceAllString(text, "")
	text = strings.TrimSpace(upstreamSpacePattern.ReplaceAllString(text, " "))
	if text == "" || len(text) > 600 {
		return "", false
	}
	lower := strings.ToLower(text)
	for _, word := range upstreamIdentityWords {
		if strings.Contains(lower, word) {
			return "", false
		}
	}
	return text, true
}

func isModelNotFoundText(message string) bool {
	lower := strings.ToLower(message)
	for _, marker := range []string{"not supported by any", "model_not_found", "model not found", "does not exist", "no such model", "unknown model", "requested resource is unavailable", "not found"} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// PublicUpstreamError returns the error a customer may see. Errors produced by
// new-api itself are returned unchanged; upstream errors become a new error
// with a neutral message, a standard type/code and, where the upstream status
// would reveal its internals (401/402/403, Cloudflare 52x), a neutral status.
func PublicUpstreamError(c *gin.Context, err *types.NewAPIError) *types.NewAPIError {
	if !IsUpstreamError(err) {
		return err
	}
	model := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)
	original := err.Error()
	status := err.StatusCode
	var message, kind string
	switch {
	case status == http.StatusTooManyRequests:
		message, kind = i18n.T(c, i18n.MsgRelayUpstreamRateLimited), "rate_limit_error"
	case status == http.StatusUnauthorized || status == http.StatusPaymentRequired || status == http.StatusForbidden:
		status, message, kind = http.StatusServiceUnavailable, i18n.T(c, i18n.MsgRelayUpstreamUnavailable), "overloaded_error"
	case status == http.StatusNotFound || (status >= 400 && status < 500 && isModelNotFoundText(original)):
		status, message, kind = http.StatusNotFound, i18n.T(c, i18n.MsgRelayUpstreamModelUnavailable, map[string]any{"Model": model}), "not_found_error"
	case status == http.StatusRequestTimeout || status == http.StatusGatewayTimeout || status == 524:
		status, message, kind = http.StatusGatewayTimeout, i18n.T(c, i18n.MsgRelayUpstreamTimeout), "api_error"
	case status >= 400 && status < 500:
		kind = "invalid_request_error"
		gemini := err.GetErrorType() == types.ErrorTypeGeminiError || common.GetContextKeyInt(c, constant.ContextKeyChannelType) == constant.ChannelTypeGemini ||
			(c.Request != nil && c.Request.URL != nil && strings.HasPrefix(c.Request.URL.Path, "/v1beta/models/"))
		if gemini || err.GetErrorCode() == "gemini_upstream_error" || IsViolationFeeCode(err.GetErrorCode()) {
			message = i18n.T(c, i18n.MsgRelayUpstreamInvalidRequest)
		} else if text, ok := scrubUpstreamText(original); ok {
			message = text
		} else {
			message = i18n.T(c, i18n.MsgRelayUpstreamInvalidRequest)
		}
	default:
		if status < 500 || status > 511 {
			status = http.StatusBadGateway
		}
		message, kind = i18n.T(c, i18n.MsgRelayUpstreamUnavailable), "api_error"
		if status == http.StatusServiceUnavailable {
			kind = "overloaded_error"
		}
	}
	public := types.WithOpenAIError(types.OpenAIError{Message: message, Type: kind, Code: kind}, status)
	public.MarkPublic()
	return public
}
