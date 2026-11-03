package claude

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

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
	// The client still receives the upstream body unchanged.
	assert.Equal(t, body, w.Body.String())
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
			if format == types.RelayFormatClaude {
				// The message_delta usage patch keeps provider_usage for the client.
				assert.Contains(t, w.Body.String(), `"provider_usage"`)
			}
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
