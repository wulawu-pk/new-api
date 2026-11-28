package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const countTokensTestBody = `{"model":"claude-opus-5-5","max_tokens":1024,` +
	`"messages":[{"role":"user","content":"count this prompt"}],` +
	`"tools":[{"name":"lookup","description":"Look up a value","input_schema":{"type":"object","properties":{"query":{"type":"string"}}}}]}`

func newCountTokensTestContext(t *testing.T, rawBody, baseURL string, channelType int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	require.NoError(t, i18n.Init())
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages/count_tokens", strings.NewReader(rawBody))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyOriginalModel, "claude-opus-5-5")
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, "claude-ccmax")
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "claude-ccmax")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, channelType)
	common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, baseURL)
	common.SetContextKey(ctx, constant.ContextKeyChannelKey, "sk-upstream")
	return ctx, recorder
}

// The count must be the channel's own figure, passed through unchanged.
func TestCountClaudeTokensReturnsTheChannelCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		assert.Equal(t, "/v1/messages/count_tokens", r.URL.Path)
		assert.Contains(t, string(body), "count this prompt")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"input_tokens":17}`)
	}))
	t.Cleanup(upstream.Close)
	ctx, recorder := newCountTokensTestContext(t, countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		InputTokens int `json:"input_tokens"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, 17, response.InputTokens)
}

func TestCountClaudeTokensRejectsChannelsWithoutTheEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("a channel without the endpoint must not be asked to count")
	}))
	t.Cleanup(upstream.Close)
	ctx, recorder := newCountTokensTestContext(t, countTokensTestBody, upstream.URL, constant.ChannelTypeOpenAI)

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusNotFound, recorder.Code)
	assertClaudeErrorBody(t, recorder.Body.String(), "not available")
}

func TestCountClaudeTokensHidesUpstreamDetail(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":{"message":"group claude-ccmax on https://api.supergpt.dev is exhausted","type":"api_error"}}`)
	}))
	t.Cleanup(upstream.Close)
	ctx, recorder := newCountTokensTestContext(t, countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	body := recorder.Body.String()
	assert.NotContains(t, body, "ccmax")
	assert.NotContains(t, body, "supergpt")
	assertClaudeErrorBody(t, body, "unavailable")
}

func assertClaudeErrorBody(t *testing.T, body, messageFragment string) {
	t.Helper()
	var response struct {
		Type  string `json:"type"`
		Error struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, common.Unmarshal([]byte(body), &response))
	assert.Equal(t, "error", response.Type)
	assert.NotEmpty(t, response.Error.Type)
	assert.Contains(t, strings.ToLower(response.Error.Message), messageFragment)
}

func TestCountClaudeTokensRejectsMissingMessages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/messages/count_tokens",
		strings.NewReader(`{"model":"gemini-3.6-flash"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	var response struct {
		Type  string `json:"type"`
		Error struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "error", response.Type)
	assert.Equal(t, "invalid_request_error", response.Error.Type)
	assert.Contains(t, response.Error.Message, "messages")
}
