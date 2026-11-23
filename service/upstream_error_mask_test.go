package service

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func maskTestContext(t *testing.T) *gin.Context {
	t.Helper()
	require.NoError(t, i18n.Init())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Request.Header.Set("Accept-Language", "zh-CN")
	common.SetContextKey(c, constant.ContextKeyOriginalModel, "gpt-6.1-sol")
	return c
}

func upstreamOpenAIError(status int, message, kind, code string) *types.NewAPIError {
	return types.WithOpenAIError(types.OpenAIError{Message: message, Type: kind, Code: code}, status)
}

// Every upstream text below was seen by customers on the live site.
func TestPublicUpstreamErrorHidesUpstreamDetails(t *testing.T) {
	c := maskTestContext(t)
	cases := []struct {
		name       string
		err        *types.NewAPIError
		wantStatus int
		wantType   string
		mustHave   string
	}{
		{"no accounts", upstreamOpenAIError(404, `Model "gpt-6.1-sol" is not supported by any configured account in this group`, "not_found_error", "unknown_error"), 404, "not_found_error", "gpt-6.1-sol"},
		{"resource unavailable", upstreamOpenAIError(404, "The requested resource is unavailable.", "not_found_error", "not_found_error"), 404, "not_found_error", "暂时不可用"},
		{"cloudflare 502", types.NewOpenAIError(errors.New("The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured."), types.ErrorCodeBadResponseStatusCode, 502), 502, "api_error", "服务暂时不可用"},
		{"cloudflare 524", types.NewOpenAIError(errors.New("The origin web server did not return a complete response within the 120-second Proxy Read Timeout window."), types.ErrorCodeBadResponseStatusCode, 524), 504, "api_error", "超时"},
		{"upstream balance", upstreamOpenAIError(403, "Insufficient account balance", "insufficient_quota", "insufficient_balance"), 503, "overloaded_error", "服务暂时不可用"},
		{"upstream balance lowercase", upstreamOpenAIError(403, "insufficient balance", "", ""), 503, "overloaded_error", "服务暂时不可用"},
		{"upstream key", upstreamOpenAIError(401, "Invalid API key", "authentication_error", "invalid_api_key"), 503, "overloaded_error", "服务暂时不可用"},
		{"generic 500", upstreamOpenAIError(500, "The request could not be completed. Please try again later.", "", ""), 500, "api_error", "服务暂时不可用"},
		{"rate limited", upstreamOpenAIError(429, "Rate limit reached for account pool xyz", "rate_limit_error", "rate_limit"), 429, "rate_limit_error", "请求过多"},
		{"html body", types.NewOpenAIError(errors.New("bad response status code 503, body: <!DOCTYPE html><html><title>supergpt</title>"), types.ErrorCodeBadResponseStatusCode, 503), 503, "overloaded_error", "服务暂时不可用"},
		{"claude error", types.WithClaudeError(types.ClaudeError{Type: "overloaded_error", Message: "kiro pool exhausted"}, 529), 502, "api_error", "服务暂时不可用"},
		{"bad request mentions group", upstreamOpenAIError(400, "group gpt-pro does not allow this", "invalid_request_error", ""), 400, "invalid_request_error", "请求被拒绝"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			original := tc.err.Error()
			got := PublicUpstreamError(c, tc.err)
			oai := got.ToOpenAIError()
			claude := got.ToClaudeError()
			assert.Equal(t, tc.wantStatus, got.StatusCode)
			assert.Equal(t, tc.wantType, oai.Type)
			assert.Equal(t, tc.wantType, claude.Type)
			assert.Contains(t, oai.Message, tc.mustHave)
			for _, leak := range []string{"account", "Cloudflare", "origin", "balance", "pool", "supergpt", "kiro", "group", "<"} {
				assert.NotContains(t, oai.Message, leak)
				assert.NotContains(t, claude.Message, leak)
			}
			assert.Equal(t, original, tc.err.Error(), "the original error used for retries must stay intact")
			assert.Same(t, got, PublicUpstreamError(c, got), "a public error is not rewritten twice")
		})
	}
}

func TestPublicUpstreamErrorKeepsUsefulRequestErrors(t *testing.T) {
	c := maskTestContext(t)
	for _, message := range []string{
		"This model is not supported on the Chat Completions endpoint",
		"Request body must be valid UTF-8 JSON. Send UTF-8 encoded bytes.",
		"max_tokens must be less than or equal to 128000",
	} {
		got := PublicUpstreamError(c, upstreamOpenAIError(400, message, "invalid_request_error", "invalid_value"))
		assert.Equal(t, 400, got.StatusCode)
		assert.Equal(t, message, got.Error())
	}
	scrubbed := PublicUpstreamError(c, upstreamOpenAIError(400, "Unsupported parameter: temperature. See https://docs.upstream.example/errors (request id: req_0123456789abcdefghijklmnop)", "invalid_request_error", ""))
	assert.Equal(t, "Unsupported parameter: temperature. See", scrubbed.Error())
}

func TestPublicUpstreamErrorLeavesLocalErrorsAlone(t *testing.T) {
	c := maskTestContext(t)
	for _, err := range []*types.NewAPIError{
		types.NewErrorWithStatusCode(errors.New("用户额度不足"), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden),
		types.NewError(errors.New("分组 claude-kiro 下模型 x 无可用渠道"), types.ErrorCodeModelNotFound),
		types.NewErrorWithStatusCode(errors.New("bad json"), types.ErrorCodeInvalidRequest, http.StatusBadRequest),
		types.NewOpenAIError(errors.New("bad"), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden),
	} {
		assert.Same(t, err, PublicUpstreamError(c, err))
	}
}

// The customer's error log carries the neutral message; the upstream text
// stays in admin_info for administrators.
func TestProcessChannelErrorLogsNeutralMessageForCustomers(t *testing.T) {
	previousDB, previousLogDB, previousType := model.DB, model.LOG_DB, common.MainDatabaseType()
	previousErrorLog, previousAutoDisable := constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled
	previousCache, previousRedis := common.MemoryCacheEnabled, common.RedisEnabled
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetMainDatabaseType(previousType)
		constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled = previousErrorLog, previousAutoDisable
		common.MemoryCacheEnabled, common.RedisEnabled = previousCache, previousRedis
	})
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}))
	model.DB = database
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	require.NoError(t, model.InitLogDB())
	common.MemoryCacheEnabled, common.RedisEnabled = false, false
	constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled = true, false
	user := &model.User{Username: "mask-test", Status: common.UserStatusEnabled}
	require.NoError(t, database.Create(user).Error)

	c := maskTestContext(t)
	c.Set("id", user.Id)
	apiErr := upstreamOpenAIError(403, "Insufficient account balance", "insufficient_quota", "insufficient_balance")
	ProcessChannelError(c, types.ChannelError{ChannelId: 7, ChannelName: "supergpt-gpt"}, apiErr, nil)

	var logs []*model.Log
	require.NoError(t, database.Where("type = ?", model.LogTypeError).Find(&logs).Error)
	require.Len(t, logs, 1)
	row := logs[0]
	assert.Contains(t, row.Content, "status_code=503")
	assert.Contains(t, row.Content, "服务暂时不可用")
	assert.NotContains(t, row.Content, "balance")
	assert.Contains(t, row.Other, "Insufficient account balance", "admin_info keeps the upstream text")

	customerLogs, _, err := model.GetUserLogs(user.Id, model.LogFilter{}, 0, 10)
	require.NoError(t, err)
	require.Len(t, customerLogs, 1)
	customer := customerLogs[0]
	assert.NotContains(t, customer.Other, "balance")
	assert.NotContains(t, customer.Content, "balance")
	assert.True(t, strings.Contains(customer.Other, `"status_code":503`), customer.Other)
	assert.Equal(t, 403, apiErr.StatusCode, "retry and auto-disable still see the upstream status")
}
