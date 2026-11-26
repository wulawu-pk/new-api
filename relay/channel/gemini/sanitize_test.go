package gemini

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
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
	// Per-modality details come from a different count than the totals.
	require.False(t, gjson.GetBytes(out, "usageMetadata.promptTokensDetails").Exists())
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

func TestSanitizeNativeGeminiIsAnAllowList(t *testing.T) {
	t.Parallel()

	in := `{"candidates":[{"content":{"parts":[{"text":"x","vendorPartTag":"a","functionCall":{"name":"f","args":{"billing_usage":1,"turnToken":"t"}}}],"role":"model","vendorRole":"z"},"finishReason":"STOP","index":0,"relayHint":"r"}],` +
		`"usageMetadata":{"promptTokenCount":3,"totalTokenCount":4,"Unit":"u","candidatesTokensDetails":[{"modality":"TEXT","tokenCount":1}]},` +
		`"promptFeedback":{"blockReason":"blocked by relay group policy","safetyRatings":[]},"modelVersion":"m","responseId":"id","BillingUsage":{},"newRelayField":{"a":1},"turnToken":"x","turnToken":"y"}`
	out := sanitizeNativeGeminiBody([]byte(in))
	require.True(t, gjson.ValidBytes(out), "%s", out)
	for _, gone := range []string{"vendorPartTag", "vendorRole", "relayHint", "Unit", "candidatesTokensDetails", "BillingUsage", "newRelayField", "relay group policy"} {
		require.NotContains(t, string(out), gone)
	}
	// Customer data inside function arguments is kept verbatim even when it
	// uses the same words as upstream-only fields.
	require.Equal(t, int64(1), gjson.GetBytes(out, "candidates.0.content.parts.0.functionCall.args.billing_usage").Int())
	require.Equal(t, "t", gjson.GetBytes(out, "candidates.0.content.parts.0.functionCall.args.turnToken").String())
	require.False(t, gjson.GetBytes(out, "turnToken").Exists())
	require.Equal(t, "OTHER", gjson.GetBytes(out, "promptFeedback.blockReason").String())
	require.Equal(t, "SAFETY", gjson.GetBytes(sanitizeNativeGeminiBody([]byte(`{"promptFeedback":{"blockReason":"SAFETY"}}`)), "promptFeedback.blockReason").String())
}

func TestNativeStreamUsageAfterAllCandidates(t *testing.T) {
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	c, rec := nativeTestContext(t, "/v1beta/models/test:streamGenerateContent")
	info := newGeminiResponsesRelayInfo(true)
	first := `{"candidates":[{"index":0,"finishReason":"STOP","content":{"parts":[{"text":"first"}]}}],"usageMetadata":{"promptTokenCount":38,"totalTokenCount":58}}`
	second := `{"candidates":[{"index":1,"finishReason":"STOP","content":{"parts":[{"thoughtSignature":"sig"}]}}],"usageMetadata":{"totalTokenCount":65}}`
	last := `{"usageMetadata":{"totalTokenCount":100}}`
	resp := &http.Response{Body: io.NopCloser(strings.NewReader("data: " + first + "\n\ndata: " + second + "\n\ndata: " + last + "\n\n"))}
	usage, apiErr := GeminiTextGenerationStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage.BillingUsage)
	var frames []string
	for line := range strings.SplitSeq(rec.Body.String(), "\n") {
		if data, ok := strings.CutPrefix(line, "data: "); ok {
			frames = append(frames, data)
		}
	}
	require.Len(t, frames, 3)
	require.Contains(t, frames[0], "first")
	require.Contains(t, frames[1], `"thoughtSignature":"sig"`)
	require.Equal(t, 1, strings.Count(rec.Body.String(), `"usageMetadata"`))
	require.JSONEq(t, `{"usageMetadata":{"promptTokenCount":38,"totalTokenCount":100}}`, frames[2])
}

func TestGeminiEnvelopeErrorIsNeutralised(t *testing.T) {
	require.NoError(t, i18n.Init())
	c, _ := nativeTestContext(t, "/v1beta/models/gemini-3.8-flash:generateContent")
	body := []byte(`{"error":{"code":403,"message":"group gemini-ultra key quota exhausted on relay","status":"PERMISSION_DENIED"}}`)
	apiErr := geminiEnvelopeError(body)
	require.NotNil(t, apiErr)
	require.True(t, service.IsUpstreamError(apiErr))
	public := service.PublicUpstreamError(c, apiErr)
	require.NotContains(t, public.Error(), "quota")
	require.NotContains(t, public.Error(), "gemini-ultra")
	require.Equal(t, http.StatusServiceUnavailable, public.StatusCode)
	require.Nil(t, geminiEnvelopeError([]byte(upstreamNativeBody)))

	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeGemini, RelayFormat: types.RelayFormatGemini,
		OriginModelName: "gemini-3.8-flash", ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.8-flash"}}
	resp := &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(bytes.NewReader(body))}
	c2, rec := nativeTestContext(t, "/v1beta/models/gemini-3.8-flash:generateContent")
	_, handlerErr := GeminiTextGenerationHandler(c2, info, resp)
	require.NotNil(t, handlerErr)
	require.Empty(t, rec.Body.String(), "nothing may be copied to the client before the neutral error exit")
}

func TestScrubUsageAtKeepsTotalsOnly(t *testing.T) {
	t.Parallel()

	in := []byte(`{"id":"x","usage":{"prompt_tokens":65,"completion_tokens":44,"total_tokens":109,"usage_source":"gemini_chat","billing_usage":{"source":"gemini_chat","gemini_usage_metadata":{"promptTokenCount":65}},"prompt_tokens_details":{"cached_tokens":0,"text_tokens":38},"completion_tokens_details":{"reasoning_tokens":41,"text_tokens":3}}}`)
	out := scrubUsageAt(in, "usage")
	require.Equal(t, int64(65), gjson.GetBytes(out, "usage.prompt_tokens").Int())
	require.Equal(t, int64(41), gjson.GetBytes(out, "usage.completion_tokens_details.reasoning_tokens").Int())
	for _, gone := range []string{"billing_usage", "usage_source", "text_tokens", "gemini_usage_metadata"} {
		require.NotContains(t, string(out), gone)
	}
	require.Equal(t, "x", gjson.GetBytes(out, "id").String())
}

func TestSanitizeNativeGeminiEmbeddingDropsExtras(t *testing.T) {
	t.Parallel()

	single := []byte(`{"embedding":{"values":[0.1,0.2],"vendorTag":"x"},"billing_usage":{"unit":"billing_units"},"turnToken":"t"}`)
	out := sanitizeNativeGeminiEmbeddingBody(single)
	require.True(t, gjson.ValidBytes(out), "%s", out)
	require.Equal(t, 2, len(gjson.GetBytes(out, "embedding.values").Array()))
	for _, gone := range []string{"vendorTag", "billing_usage", "turnToken"} {
		require.NotContains(t, string(out), gone)
	}

	batch := []byte(`{"embeddings":[{"values":[0.3],"extra":1}],"relayMeta":"supergpt"}`)
	outB := sanitizeNativeGeminiEmbeddingBody(batch)
	require.True(t, gjson.ValidBytes(outB), "%s", outB)
	require.Equal(t, 1, len(gjson.GetBytes(outB, "embeddings.0.values").Array()))
	for _, gone := range []string{"extra", "relayMeta", "supergpt"} {
		require.NotContains(t, string(outB), gone)
	}
}

func TestGeminiAliasesAndNestedContainers(t *testing.T) {
	in := `{"candidates":[{"content":{"parts":[{"inline_data":{"mime_type":"image/png","data":"AA==","private":1},"thought_signature":"abc"},{"function_call":{"id":"f","name":"lookup","args":{"privateBusiness":9007199254740993},"private":1}}]},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"doc","private":2}}]},"safetyRatings":[{"category":"SAFETY","private":1}]}],"usage_metadata":{"prompt_token_count":19,"candidates_token_count":2,"total_token_count":21,"prompt_tokens_details":[{"modality":"TEXT","token_count":19}]}}`
	c, rec := nativeTestContext(t, "/v1beta/models/test:generateContent")
	usage, apiErr := GeminiTextGenerationHandler(c, newGeminiResponsesRelayInfo(false), &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(in))})
	require.Nil(t, apiErr)
	out := rec.Body.String()
	require.Equal(t, 21, usage.TotalTokens)
	require.NotNil(t, usage.BillingUsage.GeminiUsageMetadata)
	require.Len(t, usage.BillingUsage.GeminiUsageMetadata.PromptTokensDetails, 1)
	require.Equal(t, 19, usage.BillingUsage.GeminiUsageMetadata.PromptTokensDetails[0].TokenCount)
	require.NotContains(t, out, "promptTokensDetails")
	require.Equal(t, "image/png", gjson.Get(out, "candidates.0.content.parts.0.inlineData.mimeType").String())
	require.Contains(t, out, `"data":"AA=="`)
	require.Contains(t, out, `"thoughtSignature":"abc"`)
	require.Contains(t, out, `"args":{"privateBusiness":9007199254740993}`)
	require.NotContains(t, out, `"private"`)
	for _, body := range []string{`{"error":null,"error":{"message":"hidden"}}`, `{"usageMetadata":{"totalTokenCount":1,"totalTokenCount":2}}`, `{"embeddings":[{"values":[1]},null,{"values":[3]}]}`, `{"embeddings":[{"values":[1]}],"embedding":{"values":{"private":true}}}`, `{"error":{"code":400,"message":"hidden"}}`} {
		for _, native := range []bool{true, false} {
			c, rec := nativeTestContext(t, "/v1/embeddings")
			info := newGeminiResponsesRelayInfo(false)
			info.IsGeminiBatchEmbedding = true
			resp := &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}
			if native {
				_, apiErr = NativeGeminiEmbeddingHandler(c, resp, info)
			} else {
				_, apiErr = GeminiEmbeddingHandler(c, info, resp)
			}
			require.NotNil(t, apiErr)
			require.Empty(t, rec.Body.String())
		}
	}
}

func TestGeminiStreamFailureOutcomes(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	failure := `{"error":{"code":400,"message":"unexpected dialect"}}`
	good := `{"candidates":[{"content":{"parts":[{"text":"hello"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2,"totalTokenCount":12}}`
	for _, format := range []types.RelayFormat{types.RelayFormatGemini, types.RelayFormatOpenAI, types.RelayFormatOpenAIResponses} {
		for _, tc := range []struct {
			name, contentType, body string
			partial                 bool
		}{
			{"json", "application/json", strings.Replace(failure, "{", "{\n", 1), false},
			{"bare", "text/event-stream", failure, false},
			{"first", "text/event-stream", "data: " + failure + "\n\n", false},
			{"second", "text/event-stream", "data: " + good + "\n\ndata: " + failure + "\n\n", true},
		} {
			t.Run(string(format)+"/"+tc.name, func(t *testing.T) {
				c, rec := nativeTestContext(t, "/v1/responses")
				info := newGeminiResponsesRelayInfo(true)
				info.RelayFormat = format
				info.SetEstimatePromptTokens(900)
				resp := &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {tc.contentType}}, Body: io.NopCloser(strings.NewReader(tc.body))}
				handler := GeminiChatStreamHandler
				switch format {
				case types.RelayFormatGemini:
					handler = GeminiTextGenerationStreamHandler
				case types.RelayFormatOpenAIResponses:
					handler = GeminiResponsesStreamHandler
				}
				usage, err := handler(c, info, resp)
				require.NotNil(t, err)
				require.True(t, err.IsUpstream())
				require.Equal(t, i18n.T(c, i18n.MsgRelayUpstreamInvalidRequest), service.PublicUpstreamError(c, err).Error())
				require.NotContains(t, rec.Body.String(), "unexpected dialect")
				require.True(t, info.StreamStatus.ResponseFailed())
				if !tc.partial {
					require.Nil(t, usage)
					require.Empty(t, rec.Body.String())
					return
				}
				require.Contains(t, rec.Body.String(), "hello")
				require.Equal(t, 12, usage.TotalTokens)
				require.False(t, service.ShouldRetryRelayError(c, err, 2))
				require.True(t, types.IsSkipRetryError(err))
				if format == types.RelayFormatGemini {
					require.NotContains(t, rec.Body.String(), "usageMetadata")
				}
				if format == types.RelayFormatOpenAIResponses {
					require.Contains(t, rec.Body.String(), "response.failed")
					require.NotContains(t, rec.Body.String(), "response.completed")
				}
			})
		}
	}
}

func TestGeminiStreamEnvelopeErrorStopsBeforeLeak(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })

	c, rec := nativeTestContext(t, "/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeGemini, RelayFormat: types.RelayFormatGemini, IsStream: true,
		OriginModelName: "gemini-3.8-flash", ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.8-flash"}}
	errFrame := `{"error":{"code":403,"message":"supergpt group gemini-ultra balance exhausted"}}`
	resp := &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}},
		Body: io.NopCloser(bytes.NewBufferString("data: " + errFrame + "\r\n\r\n"))}

	_, apiErr := GeminiTextGenerationStreamHandler(c, info, resp)
	require.NotNil(t, apiErr)
	require.True(t, service.IsUpstreamError(apiErr))
	public := service.PublicUpstreamError(c, apiErr)
	require.Equal(t, http.StatusServiceUnavailable, public.StatusCode)
	require.NotContains(t, public.Error(), "supergpt")
	require.NotContains(t, public.Error(), "balance")
	require.Empty(t, rec.Body.String())
}
