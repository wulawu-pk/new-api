package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The client's body as Claude Code sends it: fields the counting endpoint
// ignores (max_tokens, stream, metadata) must reach the upstream unchanged, and
// so must the ones it reads.
const countTokensTestBody = `{"model":"claude-opus-5-5","max_tokens":1024,"stream":false,` +
	`"metadata":{"user_id":"u-1"},"system":"be brief",` +
	`"tools":[{"name":"lookup","description":"Look up a value",` +
	`"input_schema":{"type":"object","properties":{"q":{"type":"string"}}}}],` +
	`"messages":[{"role":"user","content":"count this prompt"}]}`

type countTokensUpstreamCall struct {
	called      bool
	method      string
	path        string
	query       string
	body        string
	apiKey      string
	beta        string
	version     string
	contentType string
	accept      string
}

func serveCountTokensUpstream(t *testing.T, status int, response string) (*httptest.Server, *countTokensUpstreamCall) {
	t.Helper()
	call := &countTokensUpstreamCall{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		call.called = true
		call.method = r.Method
		call.path = r.URL.Path
		call.query = r.URL.RawQuery
		call.body = string(body)
		call.apiKey = r.Header.Get("x-api-key")
		call.beta = r.Header.Get("anthropic-beta")
		call.version = r.Header.Get("anthropic-version")
		call.contentType = r.Header.Get("Content-Type")
		call.accept = r.Header.Get("Accept")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, response)
	}))
	t.Cleanup(server.Close)
	return server, call
}

func newCountTokensTestContext(t *testing.T, requestURI, rawBody, baseURL string, channelType int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	require.NoError(t, i18n.Init())
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, requestURI, strings.NewReader(rawBody))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("anthropic-version", "2023-06-01")
	c.Request.Header.Add("anthropic-beta", "claude-code-20250219")
	c.Request.Header.Add("anthropic-beta", "interleaved-thinking-2025-05-14")
	// The customer's own key must never reach the upstream.
	c.Request.Header.Set("x-api-key", "sk-customer")
	common.SetContextKey(c, constant.ContextKeyOriginalModel, "claude-opus-5-5")
	common.SetContextKey(c, constant.ContextKeyUsingGroup, "claude-ccmax")
	common.SetContextKey(c, constant.ContextKeyUserGroup, "claude-ccmax")
	common.SetContextKey(c, constant.ContextKeyChannelType, channelType)
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, baseURL)
	common.SetContextKey(c, constant.ContextKeyChannelKey, "sk-upstream")
	return c, recorder
}

func runCountTokensHelper(t *testing.T, c *gin.Context) *types.NewAPIError {
	t.Helper()
	request, err := helper.GetAndValidateClaudeRequest(c)
	require.NoError(t, err)
	info := relaycommon.GenRelayInfoClaude(c, request)
	return ClaudeCountTokensHelper(c, info)
}

// The count must come from the channel that will serve the prompt, so it
// matches what the customer is billed for, and only the public field may come
// back.
func TestClaudeCountTokensForwardsToTheChannelEndpoint(t *testing.T) {
	upstream, call := serveCountTokensUpstream(t, http.StatusOK, `{"input_tokens":42,"cache_creation_input_tokens":7}`)
	c, recorder := newCountTokensTestContext(t, "/v1/messages/count_tokens", countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

	apiErr := runCountTokensHelper(t, c)

	require.Nil(t, apiErr)
	require.True(t, call.called)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"input_tokens":42}`, recorder.Body.String())
	assert.NotContains(t, recorder.Body.String(), "cache_creation_input_tokens")

	assert.Equal(t, http.MethodPost, call.method)
	assert.Equal(t, "/v1/messages/count_tokens", call.path)
	assert.Equal(t, countTokensTestBody, call.body, "the upstream must count exactly the client's body")
	assert.Equal(t, "sk-upstream", call.apiKey)
	assert.Equal(t, "2023-06-01", call.version)
	assert.Equal(t, "claude-code-20250219,interleaved-thinking-2025-05-14", call.beta)
	assert.Equal(t, "application/json", call.contentType)
	assert.Equal(t, "application/json", call.accept)
}

func TestClaudeCountTokensKeepsTheBetaQuery(t *testing.T) {
	upstream, call := serveCountTokensUpstream(t, http.StatusOK, `{"input_tokens":1}`)
	c, recorder := newCountTokensTestContext(t, "/v1/messages/count_tokens?beta=true", countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

	require.Nil(t, runCountTokensHelper(t, c))

	require.True(t, call.called)
	assert.Equal(t, "beta=true", call.query)
	assert.Equal(t, http.StatusOK, recorder.Code)
}

// A channel that is not the Anthropic protocol has no counting endpoint to ask,
// and the relay must not guess the number locally: clients get a 404 instead of
// a figure that will not match their bill.
func TestClaudeCountTokensRejectsChannelsWithoutTheEndpoint(t *testing.T) {
	upstream, call := serveCountTokensUpstream(t, http.StatusOK, `{"input_tokens":42}`)
	c, recorder := newCountTokensTestContext(t, "/v1/messages/count_tokens", countTokensTestBody, upstream.URL, constant.ChannelTypeOpenAI)

	apiErr := runCountTokensHelper(t, c)

	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusNotFound, apiErr.StatusCode)
	assert.True(t, types.IsSkipRetryError(apiErr), "an unsupported endpoint must not be retried on another channel")
	assert.Equal(t, i18n.T(c, i18n.MsgRelayCountTokensUnavailable, map[string]any{"Model": "claude-opus-5-5"}), apiErr.Error())
	assert.False(t, call.called)
	assert.Equal(t, 0, recorder.Body.Len())
}

func TestClaudeCountTokensReportsUpstreamFailuresAsUpstream(t *testing.T) {
	upstream, _ := serveCountTokensUpstream(t, http.StatusInternalServerError,
		`{"error":{"message":"group claude-ccmax at https://api.supergpt.dev is exhausted","type":"api_error"}}`)
	c, recorder := newCountTokensTestContext(t, "/v1/messages/count_tokens", countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

	apiErr := runCountTokensHelper(t, c)

	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusInternalServerError, apiErr.StatusCode)
	assert.True(t, service.IsUpstreamError(apiErr), "so the caller masks it")
	assert.Equal(t, 0, recorder.Body.Len())
}

func TestClaudeCountTokensRejectsAnUnexpectedAnswer(t *testing.T) {
	for _, response := range []string{`{"input_tokens":"42"}`, `{"input_tokens":-1}`, `{"foo":1}`, `not json`} {
		t.Run(response, func(t *testing.T) {
			upstream, _ := serveCountTokensUpstream(t, http.StatusOK, response)
			c, recorder := newCountTokensTestContext(t, "/v1/messages/count_tokens", countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)

			apiErr := runCountTokensHelper(t, c)

			require.NotNil(t, apiErr)
			assert.True(t, service.IsUpstreamError(apiErr))
			assert.Equal(t, 0, recorder.Body.Len(), "the raw upstream body must not reach the client")
		})
	}
}

func TestClaudeCountTokensAppliesTheModelMapping(t *testing.T) {
	upstream, call := serveCountTokensUpstream(t, http.StatusOK, `{"input_tokens":42}`)
	c, _ := newCountTokensTestContext(t, "/v1/messages/count_tokens", countTokensTestBody, upstream.URL, constant.ChannelTypeAnthropic)
	c.Set("model_mapping", `{"claude-opus-5-5":"claude-opus-5-5-20251101"}`)

	require.Nil(t, runCountTokensHelper(t, c))

	require.True(t, call.called)
	var forwarded map[string]any
	require.NoError(t, common.Unmarshal([]byte(call.body), &forwarded))
	assert.Equal(t, "claude-opus-5-5-20251101", forwarded["model"])
	var original map[string]any
	require.NoError(t, common.Unmarshal([]byte(countTokensTestBody), &original))
	delete(original, "model")
	delete(forwarded, "model")
	assert.Equal(t, original, forwarded, "only the model name may change")
}
