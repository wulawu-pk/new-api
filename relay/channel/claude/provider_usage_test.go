package claude

import (
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// kiroCreditExpr bills kiro responses at $0.25 per credit (v1 output is
// $/1M, so the dollar amount is scaled by 1e6) and falls back to tokens.
const kiroCreditExpr = `u("provider") == "kiro" ? tier("credit", u("credits") * 0.25 * 1000000) : tier("token", p * 2 + c * 10 + cr * 0.1)`

func newKiroTestContext(t *testing.T) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	return c, w
}

func newKiroRelayInfo(format types.RelayFormat) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		RelayFormat: format,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "claude-sonnet-5-5"},
	}
}

func TestHandleClaudeResponseDataCapturesKiroCredits(t *testing.T) {
	c, w := newKiroTestContext(t)
	info := newKiroRelayInfo(types.RelayFormatClaude)
	body := `{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5",` +
		`"content":[{"type":"text","text":"hi"}],"stop_reason":"end_turn",` +
		`"usage":{"input_tokens":709,"output_tokens":236},` +
		`"provider_usage":{"provider":"kiro","credits":0.0382,"context_usage_percentage":1.25}}`

	require.Nil(t, HandleClaudeResponseData(c, info, &ClaudeResponseInfo{Usage: &dto.Usage{}}, nil, []byte(body)))

	require.NotNil(t, info.ProviderUsage)
	assert.Equal(t, "kiro", info.ProviderUsage["provider"])
	assert.Equal(t, 0.0382, info.ProviderUsage["credits"])
	assert.Equal(t, 1.25, info.ProviderUsage["context_usage_percentage"])
	// The client gets the upstream body minus provider_usage.
	assert.NotContains(t, w.Body.String(), "provider_usage")
	assert.NotContains(t, w.Body.String(), "kiro")
	assert.JSONEq(t, `{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5",`+
		`"content":[{"type":"text","text":"hi"}],"stop_reason":"end_turn",`+
		`"usage":{"input_tokens":709,"output_tokens":236}}`, w.Body.String())
}

func TestHandleClaudeResponseDataWithoutProviderUsage(t *testing.T) {
	c, _ := newKiroTestContext(t)
	info := newKiroRelayInfo(types.RelayFormatClaude)
	body := `{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5",` +
		`"content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":5,"output_tokens":1}}`

	require.Nil(t, HandleClaudeResponseData(c, info, &ClaudeResponseInfo{Usage: &dto.Usage{}}, nil, []byte(body)))
	assert.Nil(t, info.ProviderUsage)
}

func TestCaptureClaudeProviderUsageIgnoresInvalidCredits(t *testing.T) {
	for _, data := range []string{
		`{"provider_usage":{"provider":"kiro"}}`,
		`{"provider_usage":{"provider":"kiro","credits":"0.1"}}`,
		`{"provider_usage":{"provider":"kiro","credits":-1}}`,
		// 1e999 parses as +Inf; it must not settle at the per-request cap.
		`{"provider_usage":{"provider":"kiro","credits":1e999}}`,
		`{"provider_usage":{"provider":"kiro","credits":-1e999}}`,
		`{"provider_usage":{"provider":"kiro","credits":10000.5}}`,
		`{"provider_usage":null}`,
	} {
		info := &relaycommon.RelayInfo{}
		captureClaudeProviderUsage(info, []byte(data))
		assert.Nil(t, info.ProviderUsage, data)
	}
}

func streamKiroEvents(t *testing.T, c *gin.Context, info *relaycommon.RelayInfo, delta string) *ClaudeResponseInfo {
	t.Helper()
	state := &ClaudeResponseInfo{Usage: &dto.Usage{}}
	require.Nil(t, HandleStreamResponseData(c, info, state, `{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5","content":[],"usage":{"input_tokens":3470,"output_tokens":1}}}`))
	require.Nil(t, HandleStreamResponseData(c, info, state, `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`))
	require.Nil(t, HandleStreamResponseData(c, info, state, `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}`))
	require.Nil(t, HandleStreamResponseData(c, info, state, `{"type":"content_block_stop","index":0}`))
	// The ordering matters: credits must not exist before message_delta.
	assert.Nil(t, info.ProviderUsage)
	require.Nil(t, HandleStreamResponseData(c, info, state, delta))
	require.Nil(t, HandleStreamResponseData(c, info, state, `{"type":"message_stop"}`))
	HandleStreamFinalResponse(c, info, state)
	return state
}

func TestHandleStreamResponseDataCapturesKiroCreditsFromMessageDelta(t *testing.T) {
	const delta = `{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},` +
		`"usage":{"output_tokens":49},` +
		`"provider_usage":{"provider":"kiro","credits":0.0442,"context_usage_percentage":2.5}}`

	for _, format := range []types.RelayFormat{types.RelayFormatClaude, types.RelayFormatOpenAI} {
		t.Run(string(format), func(t *testing.T) {
			c, w := newKiroTestContext(t)
			info := newKiroRelayInfo(format)
			state := streamKiroEvents(t, c, info, delta)

			require.NotNil(t, info.ProviderUsage)
			assert.Equal(t, "kiro", info.ProviderUsage["provider"])
			assert.Equal(t, 0.0442, info.ProviderUsage["credits"])
			assert.Equal(t, 2.5, info.ProviderUsage["context_usage_percentage"])
			assert.Equal(t, 49, state.Usage.CompletionTokens)
			// Billing captured it; the client never sees it.
			assert.NotContains(t, w.Body.String(), "provider_usage")
			assert.NotContains(t, w.Body.String(), "kiro")
		})
	}
}

func TestHandleStreamResponseDataWithoutProviderUsage(t *testing.T) {
	c, _ := newKiroTestContext(t)
	info := newKiroRelayInfo(types.RelayFormatClaude)
	streamKiroEvents(t, c, info, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":49}}`)
	assert.Nil(t, info.ProviderUsage)
}

// End to end: the credits captured from a stream drive tiered settlement.
func TestKiroStreamCreditsSettleThroughTieredExpr(t *testing.T) {
	const quotaPerUnit = 500_000.0
	const groupRatio = 1.0
	c, _ := newKiroTestContext(t)
	info := newKiroRelayInfo(types.RelayFormatClaude)
	info.TieredBillingSnapshot = &billingexpr.BillingSnapshot{
		BillingMode:  "tiered_expr",
		ExprString:   kiroCreditExpr,
		ExprHash:     billingexpr.ExprHashString(kiroCreditExpr),
		GroupRatio:   groupRatio,
		QuotaPerUnit: quotaPerUnit,
		ExprVersion:  1,
	}
	info.BillingRequestInput = &billingexpr.RequestInput{}
	streamKiroEvents(t, c, info, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":49},"provider_usage":{"provider":"kiro","credits":0.0442}}`)

	ok, quota, result := service.TryTieredSettle(info, billingexpr.TokenParams{P: 3470, C: 49})
	require.True(t, ok)
	require.NotNil(t, result)
	assert.Equal(t, "credit", result.MatchedTier)
	assert.Equal(t, int(math.Round(0.0442*0.25*quotaPerUnit*groupRatio)), quota)
	assert.Equal(t, 5525, quota)
	assert.Nil(t, info.BillingRequestInput.Usage, "frozen request input must not be mutated")
}

func TestCaptureClaudeProviderUsageDropsNonFinitePercentage(t *testing.T) {
	info := &relaycommon.RelayInfo{}
	captureClaudeProviderUsage(info, []byte(`{"provider_usage":{"provider":"kiro","credits":0.5,"context_usage_percentage":1e999}}`))
	require.NotNil(t, info.ProviderUsage)
	assert.Equal(t, 0.5, info.ProviderUsage["credits"])
	_, hasPercentage := info.ProviderUsage["context_usage_percentage"]
	assert.False(t, hasPercentage)
}

func TestHandleClaudeResponseDataStripsProviderUsageInConvertedFormats(t *testing.T) {
	body := `{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5",` +
		`"content":[{"type":"text","text":"hi"}],"stop_reason":"end_turn",` +
		`"usage":{"input_tokens":709,"output_tokens":236},` +
		`"provider_usage":{"provider":"kiro","credits":0.0061,"context_usage_percentage":0.19}}`
	for _, format := range []types.RelayFormat{types.RelayFormatOpenAI, types.RelayFormatOpenAIResponses} {
		t.Run(string(format), func(t *testing.T) {
			c, w := newKiroTestContext(t)
			info := newKiroRelayInfo(format)
			require.Nil(t, HandleClaudeResponseData(c, info, &ClaudeResponseInfo{Usage: &dto.Usage{}}, nil, []byte(body)))
			require.NotNil(t, info.ProviderUsage)
			assert.Equal(t, 0.0061, info.ProviderUsage["credits"])
			assert.NotContains(t, w.Body.String(), "provider_usage")
			assert.NotContains(t, w.Body.String(), "kiro")
		})
	}
}

// kiro also puts provider_usage inside message_start.message; every event the
// client receives must be clean while billing still sees the delta credits.
func TestHandleStreamResponseDataStripsProviderUsageFromEveryEvent(t *testing.T) {
	c, w := newKiroTestContext(t)
	info := newKiroRelayInfo(types.RelayFormatClaude)
	state := &ClaudeResponseInfo{Usage: &dto.Usage{}}
	events := []string{
		`{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5","content":[],` +
			`"usage":{"input_tokens":3470,"output_tokens":1},"provider_usage":{"provider":"kiro","credits":0,"context_usage_percentage":0.19}}}`,
		`{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}`,
		`{"type":"content_block_stop","index":0}`,
		`{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":49},` +
			`"provider_usage":{"provider":"kiro","credits":0.0061,"context_usage_percentage":0.19}}`,
		`{"type":"message_stop"}`,
	}
	for _, event := range events {
		require.Nil(t, HandleStreamResponseData(c, info, state, event))
	}
	HandleStreamFinalResponse(c, info, state)

	out := w.Body.String()
	assert.NotContains(t, out, "provider_usage")
	assert.NotContains(t, out, "kiro")
	assert.Contains(t, out, `"input_tokens":3470`)
	assert.Contains(t, out, `"output_tokens":49`)
	require.NotNil(t, info.ProviderUsage)
	assert.Equal(t, "kiro", info.ProviderUsage["provider"])
	assert.Equal(t, 0.0061, info.ProviderUsage["credits"])
	assert.Equal(t, 0.19, info.ProviderUsage["context_usage_percentage"])
}

func TestStripClaudeProviderUsageLeavesOtherBodiesUntouched(t *testing.T) {
	body := []byte(`{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}`)
	out := stripClaudeProviderUsage(body)
	assert.Equal(t, string(body), string(out))
	// A text that merely mentions the word is not rewritten.
	mention := []byte(`{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"provider_usage"}}`)
	assert.Equal(t, string(mention), string(stripClaudeProviderUsage(mention)))
}

// The converted stream paths (Claude -> Chat, Claude -> Responses) rebuild
// events from dto.ClaudeResponse, so provider_usage cannot reach the client;
// this pins that down end to end through the SSE scanner.
func TestClaudeConvertedStreamsDoNotLeakProviderUsage(t *testing.T) {
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	stream := "data: " + `{"type":"message_start","message":{"id":"msg_1","type":"message","model":"claude-sonnet-5-5","role":"assistant","content":[],` +
		`"usage":{"input_tokens":2,"output_tokens":0},"provider_usage":{"provider":"kiro","credits":0,"context_usage_percentage":0.19}}}` +
		"\n\ndata: " + `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}` +
		"\n\ndata: " + `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}` +
		"\n\ndata: " + `{"type":"content_block_stop","index":0}` +
		"\n\ndata: " + `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3},` +
		`"provider_usage":{"provider":"kiro","credits":0.0061,"context_usage_percentage":0.19}}` +
		"\n\ndata: " + `{"type":"message_stop"}` + "\n\n"
	for _, tc := range []struct {
		name    string
		format  types.RelayFormat
		handler func(*gin.Context, *http.Response, *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError)
	}{
		{"claude", types.RelayFormatClaude, ClaudeStreamHandler},
		{"chat", types.RelayFormatOpenAI, ClaudeStreamHandler},
		{"responses", types.RelayFormatOpenAIResponses, ClaudeResponsesStreamHandler},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newKiroTestContext(t)
			info := newKiroRelayInfo(tc.format)
			info.IsStream = true
			info.DisablePing = true
			info.StartTime = time.Now()
			resp := &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(stream))}
			_, apiErr := tc.handler(c, resp, info)
			require.Nil(t, apiErr)
			out := w.Body.String()
			assert.Contains(t, out, "hello")
			assert.NotContains(t, out, "provider_usage")
			assert.NotContains(t, out, "kiro")
			require.NotNil(t, info.ProviderUsage)
			assert.Equal(t, 0.0061, info.ProviderUsage["credits"])
		})
	}
}
