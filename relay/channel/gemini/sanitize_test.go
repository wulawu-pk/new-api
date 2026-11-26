package gemini

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// A real upstream native body shape (11-27): Google fields plus the relay's own
// billing_usage, usageMetadata.unit and turnToken.
const upstreamNativeBody = `{"candidates":[{"content":{"parts":[{"text":"ok","thoughtSignature":"EssDCsgD"},{"functionCall":{"name":"read_file","args":{"path":"a"}},"thoughtSignature":"Zm9v"}],"role":"model"},"finishReason":"STOP","index":0}],` +
	`"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":1,"totalTokenCount":99,"thoughtsTokenCount":89,"promptTokensDetails":[{"modality":"TEXT","tokenCount":9}],"unit":"billing_units"},` +
	`"modelVersion":"models/gemini-3.8-flash","responseId":"uH4Ia9_qEPDS0_gP9sGs-QU","turnToken":"v1_Chd1bjRJYTlP",` +
	`"billing_usage":{"input_tokens":9,"output_tokens":90,"cache_read_tokens":0,"cache_write_tokens":0,"total_tokens":99,"unit":"billing_units","unit_cap_per_request":1000000}}`

func TestSanitizeNativeGeminiBodyDropsUpstreamOnlyFields(t *testing.T) {
	t.Parallel()

	out := sanitizeNativeGeminiBody([]byte(upstreamNativeBody))
	for _, path := range []string{"billing_usage", "turnToken", "usageMetadata.unit", "usageMetadata.billing_usage"} {
		require.Falsef(t, gjson.GetBytes(out, path).Exists(), "%s must be stripped: %s", path, out)
	}
	require.NotContains(t, string(out), "billing_units")
	require.NotContains(t, string(out), "unit_cap_per_request")

	// Everything Google returns survives, including both thought signatures.
	require.Equal(t, "ok", gjson.GetBytes(out, "candidates.0.content.parts.0.text").String())
	require.Equal(t, "EssDCsgD", gjson.GetBytes(out, "candidates.0.content.parts.0.thoughtSignature").String())
	require.Equal(t, "Zm9v", gjson.GetBytes(out, "candidates.0.content.parts.1.thoughtSignature").String())
	require.Equal(t, "read_file", gjson.GetBytes(out, "candidates.0.content.parts.1.functionCall.name").String())
	require.Equal(t, int64(89), gjson.GetBytes(out, "usageMetadata.thoughtsTokenCount").Int())
	require.Equal(t, int64(99), gjson.GetBytes(out, "usageMetadata.totalTokenCount").Int())
	require.Equal(t, "TEXT", gjson.GetBytes(out, "usageMetadata.promptTokensDetails.0.modality").String())
	require.Equal(t, "models/gemini-3.8-flash", gjson.GetBytes(out, "modelVersion").String())
	require.Equal(t, "uH4Ia9_qEPDS0_gP9sGs-QU", gjson.GetBytes(out, "responseId").String())
}

func TestSanitizeNativeGeminiBodyLeavesOtherBodiesAlone(t *testing.T) {
	t.Parallel()

	clean := []byte(`{"candidates":[{"content":{"parts":[{"text":"hi"}]}}],"usageMetadata":{"promptTokenCount":1}}`)
	require.Equal(t, clean, sanitizeNativeGeminiBody(clean))

	// A user's text that merely mentions the words is not a field and stays.
	text := []byte(`{"candidates":[{"content":{"parts":[{"text":"the \"unit\" of billing_usage and turnToken"}]}}]}`)
	require.Equal(t, text, sanitizeNativeGeminiBody(text))

	for _, raw := range [][]byte{nil, []byte(""), []byte("[DONE]"), []byte(`["billing_usage"]`), []byte(`{"billing_usage":`)} {
		require.Equal(t, raw, sanitizeNativeGeminiBody(raw))
	}
}

func nativeTestContext(t *testing.T, path string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, path, nil)
	return c, rec
}

func TestGeminiTextGenerationHandlerStripsUpstreamOnlyFields(t *testing.T) {
	c, rec := nativeTestContext(t, "/v1beta/models/gemini-3.8-flash:generateContent")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeGemini, RelayFormat: types.RelayFormatGemini,
		OriginModelName: "gemini-3.8-flash", ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.8-flash"}}
	resp := &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(upstreamNativeBody))}

	usage, apiErr := GeminiTextGenerationHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 9, usage.PromptTokens)

	body := rec.Body.Bytes()
	require.True(t, gjson.ValidBytes(body), "%s", body)
	require.False(t, gjson.GetBytes(body, "billing_usage").Exists())
	require.False(t, gjson.GetBytes(body, "turnToken").Exists())
	require.False(t, gjson.GetBytes(body, "usageMetadata.unit").Exists())
	require.Equal(t, "EssDCsgD", gjson.GetBytes(body, "candidates.0.content.parts.0.thoughtSignature").String())
}

func TestGeminiTextGenerationStreamHandlerStripsUpstreamOnlyFields(t *testing.T) {
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	c, rec := nativeTestContext(t, "/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeGemini, RelayFormat: types.RelayFormatGemini, IsStream: true,
		OriginModelName: "gemini-3.8-flash", ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.8-flash"}}
	frame1 := `{"candidates":[{"content":{"parts":[{"text":"o"}],"role":"model"},"index":0}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":1,"totalTokenCount":10,"unit":"billing_units"},"modelVersion":"models/gemini-3.8-flash","turnToken":"v1_x","billing_usage":{"input_tokens":9,"unit":"billing_units"}}`
	sse := "data: " + frame1 + "\r\n\r\n" + "data: " + upstreamNativeBody + "\r\n\r\n"
	resp := &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(bytes.NewBufferString(sse))}

	_, apiErr := GeminiTextGenerationStreamHandler(c, info, resp)
	require.Nil(t, apiErr)

	out := rec.Body.String()
	require.NotContains(t, out, "billing_usage")
	require.NotContains(t, out, "turnToken")
	require.NotContains(t, out, "billing_units")
	frames := 0
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		require.True(t, gjson.Valid(payload), "frame must stay valid JSON: %s", payload)
		frames++
	}
	require.Equal(t, 2, frames)
	require.Contains(t, out, `"thoughtSignature":"Zm9v"`)
}
