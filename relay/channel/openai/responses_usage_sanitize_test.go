package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// upstreamAttributionUsage is a real upstream usage object (11-28): OpenAI's
// public token counts plus attribution, where the relay upstream names its own
// items and splits tokens per message. The item ids name nothing OpenAI emits.
const upstreamAttributionUsage = `{"input_tokens":5373,` +
	`"input_tokens_details":{"cached_tokens":5248,"cache_write_tokens":0,"cache_write_tokens_details":{"ttl_30m_tokens":0,"ttl_12h_tokens":0}},` +
	`"output_tokens":5,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":5378,` +
	`"attribution":{"items":{"msg_upstreamprivate":{"input_tokens":5363,"cached_tokens":5248,"cache_write_tokens":0,"output_tokens":0,"content":[{"type":"text","text":"hi"}]},` +
	`"rs_upstreamprivate":{"input_tokens":10,"output_tokens":0}}}}`

// publicAttributionUsage is the same usage rebuilt from the allow-list: the
// same numbers, no attribution.
const publicAttributionUsage = `{"input_tokens":5373,` +
	`"input_tokens_details":{"cached_tokens":5248,"cache_write_tokens":0,"cache_write_tokens_details":{"ttl_30m_tokens":0,"ttl_12h_tokens":0}},` +
	`"output_tokens":5,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":5378}`

func TestSanitizeResponsesUsageKeepsPublicSchema(t *testing.T) {
	for _, tc := range []struct {
		name       string
		sanitize   func([]byte) []byte
		payload    string
		usagePath  string
		wantUsage  string
		preserved  []string
		unchanged  bool
		rawContain []string
	}{
		{
			name:      "response body",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload: `{"id":"resp_1","object":"response","created_at":1764300000,"model":"gpt-5.1","status":"completed",` +
				`"access_programs":["codex"],"output":[{"type":"message","id":"msg_public","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],` +
				`"usage":` + upstreamAttributionUsage + `}`,
			wantUsage: publicAttributionUsage,
			preserved: []string{"id", "object", "created_at", "model", "status", "access_programs", "output"},
		},
		{
			name:      "stream event",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload: `{"type":"response.completed","sequence_number":7,"response":{"id":"resp_1","object":"response","status":"completed",` +
				`"access_programs":["codex"],"usage":` + upstreamAttributionUsage + `}}`,
			wantUsage: publicAttributionUsage,
			preserved: []string{"type", "sequence_number", "response.id", "response.object", "response.status", "response.access_programs"},
		},
		{
			// The chat-completions and Claude vocabulary a relay upstream adds to
			// the shared usage DTO is not part of the Responses schema either, and
			// neither are the modality splits OpenAI does not publish there.
			name:      "relay-only usage fields",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload: `{"id":"resp_1","usage":{"input_tokens":7,"output_tokens":2,"total_tokens":9,"prompt_tokens":7,"completion_tokens":2,` +
				`"prompt_cache_hit_tokens":3,"cost":0.0001,"usage_semantic":"openai","usage_source":"upstream",` +
				`"billing_usage":{"input_tokens":7},"claude_cache_creation_1_h_tokens":4,` +
				`"input_tokens_details":{"cached_tokens":3,"cache_creation_input_tokens":4,"cached_creation_tokens":4,` +
				`"text_tokens":5,"audio_tokens":0,"cached_tokens_details":{"text_tokens":3}},` +
				`"output_tokens_details":{"reasoning_tokens":1,"text_tokens":1,"audio_tokens":0}}}`,
			wantUsage: `{"input_tokens":7,"input_tokens_details":{"cached_tokens":3},"output_tokens":2,"output_tokens_details":{"reasoning_tokens":1},"total_tokens":9}`,
			preserved: []string{"id"},
		},
		{
			name:      "usage with only private fields",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   `{"id":"resp_1","usage":{"attribution":{"items":{"msg_upstreamprivate":{}}},"prompt_tokens":7}}`,
			wantUsage: `{}`,
			preserved: []string{"id"},
		},
		{
			name:      "top-level usage wins over a nested one",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   `{"usage":{"input_tokens":1,"attribution":{"input_tokens":99,"items":{}}}}`,
			wantUsage: `{"input_tokens":1}`,
		},
		{
			name:      "usage word inside a string value",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   `{"output":[{"type":"message","content":[{"type":"output_text","text":"the word \"usage\" here"}]}]}`,
			unchanged: true,
		},
		{
			name:      "array payload",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `[]`,
			unchanged: true,
		},
		{
			name:      "whitespace around the usage member",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   "{\n  \"id\": \"resp_1\",\n  \"usage\" : " + upstreamAttributionUsage + "\n}",
			wantUsage: publicAttributionUsage,
			preserved: []string{"id"},
		},
		{
			// Numbers are copied from the upstream bytes, never re-encoded.
			name:       "numbers are copied verbatim",
			sanitize:   SanitizeResponsesResponseUsage,
			usagePath:  "usage",
			payload:    `{"usage":{"input_tokens":9007199254740993,"output_tokens":-1,"total_tokens":0,"output_tokens_details":{"reasoning_tokens":0}}}`,
			wantUsage:  `{"input_tokens":9007199254740993,"output_tokens":-1,"total_tokens":0,"output_tokens_details":{"reasoning_tokens":0}}`,
			rawContain: []string{`"input_tokens":9007199254740993`, `"output_tokens":-1`, `"total_tokens":0`},
		},
		{
			name:      "event without usage",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `{"type":"response.output_text.delta","sequence_number":1,"delta":"the word usage in text"}`,
			unchanged: true,
		},
		{
			name:      "event with null usage",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `{"type":"response.created","response":{"id":"resp_1","usage":null}}`,
			unchanged: true,
		},
		{
			name:      "body without usage",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   `{"id":"resp_1","object":"response","output":[]}`,
			unchanged: true,
		},
		{
			name:      "usage is not an object",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `{"type":"response.completed","response":{"usage":"none"}}`,
			unchanged: true,
		},
		{
			name:      "details are not an object",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   `{"usage":{"input_tokens":1,"input_tokens_details":"none","total_tokens":1}}`,
			wantUsage: `{"input_tokens":1,"total_tokens":1}`,
		},
		{
			name:      "stream done marker",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `[DONE]`,
			unchanged: true,
		},
		{
			name:      "invalid json",
			sanitize:  SanitizeResponsesEventUsage,
			usagePath: "response.usage",
			payload:   `{"type":"response.completed","response":`,
			unchanged: true,
		},
		{
			name:      "empty payload",
			sanitize:  SanitizeResponsesResponseUsage,
			usagePath: "usage",
			payload:   ``,
			unchanged: true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.sanitize([]byte(tc.payload))
			if tc.unchanged {
				require.Equal(t, tc.payload, string(got))
				return
			}
			require.True(t, gjson.ValidBytes(got), "sanitized payload must stay valid JSON: %s", got)
			require.NotContains(t, string(got), "attribution")
			require.NotContains(t, string(got), "upstreamprivate")
			require.JSONEq(t, tc.wantUsage, gjson.GetBytes(got, tc.usagePath).Raw)
			for _, path := range tc.preserved {
				require.Equal(t, gjson.Get(tc.payload, path).Raw, gjson.GetBytes(got, path).Raw, "%s must survive the rewrite", path)
			}
			for _, raw := range tc.rawContain {
				assert.Contains(t, string(got), raw)
			}
		})
	}
}

// The sanitized copy is what the client reads; billing keeps reading the
// upstream bytes, so the reported token counts must not move.
func TestOaiResponsesHandlersForwardOnlyPublicUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	const response = `{"id":"resp_1","object":"response","created_at":1764300000,"model":"gpt-5.1","status":"completed",` +
		`"access_programs":["codex"],"output":[{"type":"message","id":"msg_public","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],` +
		`"usage":` + upstreamAttributionUsage + `}`
	const opened = `{"type":"response.created","sequence_number":0,"response":{"id":"resp_1","status":"in_progress"}}`
	const delta = `{"type":"response.output_text.delta","sequence_number":1,"delta":"ok"}`
	const completed = `{"type":"response.completed","sequence_number":2,"response":` + response + `}`
	// The same terminal event with only its usage object rebuilt.
	completedPublic := strings.Replace(completed, upstreamAttributionUsage, publicAttributionUsage, 1)

	for _, tc := range []struct {
		name        string
		contentType string
		body        string
		stream      bool
		wantFrames  []string
		wantUsage   string
	}{
		{
			name:        "json",
			contentType: "application/json",
			body:        response,
			wantUsage:   publicAttributionUsage,
		},
		{
			// The upstream's own data: [DONE] is consumed by the stream scanner and
			// never re-emitted, so the client sees exactly one frame per event. The
			// rewrite must not add, drop, reorder or rename a frame.
			name:        "stream",
			contentType: "text/event-stream",
			stream:      true,
			body:        "data: " + opened + "\n\ndata: " + delta + "\n\ndata: " + completed + "\n\ndata: [DONE]\n\n",
			wantFrames:  []string{"response.created", "response.output_text.delta", "response.completed"},
			wantUsage:   publicAttributionUsage,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			c.Set(common.RequestIdKey, "responses-usage-allowlist")
			info := &relaycommon.RelayInfo{
				RelayFormat:     types.RelayFormatOpenAIResponses,
				OriginModelName: "gpt-5.1",
				IsStream:        tc.stream,
				DisablePing:     true,
				StartTime:       time.Now(),
				ChannelMeta:     &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeOpenAI, UpstreamModelName: "gpt-5.1"},
			}
			info.SetEstimatePromptTokens(5373)
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(tc.body)),
				Header:     http.Header{"Content-Type": []string{tc.contentType}},
			}

			var usage *dto.Usage
			var apiErr *types.NewAPIError
			if tc.stream {
				usage, apiErr = OaiResponsesStreamHandler(c, info, resp)
			} else {
				usage, apiErr = OaiResponsesHandler(c, info, resp)
			}
			require.Nil(t, apiErr)
			require.NotNil(t, usage)
			assert.Equal(t, 5373, usage.PromptTokens)
			assert.Equal(t, 5, usage.CompletionTokens)
			assert.Equal(t, 5378, usage.TotalTokens)
			assert.Equal(t, 5248, usage.PromptTokensDetails.CachedTokens)

			out := w.Body.String()
			require.NotContains(t, out, "attribution")
			require.NotContains(t, out, "upstreamprivate")

			if !tc.stream {
				assert.True(t, gjson.Valid(out), "the response body must stay valid JSON: %s", out)
				require.JSONEq(t, tc.wantUsage, gjson.Get(out, "usage").Raw)
				assert.Equal(t, "resp_1", gjson.Get(out, "id").String())
				assert.Equal(t, "gpt-5.1", gjson.Get(out, "model").String())
				assert.JSONEq(t, `["codex"]`, gjson.Get(out, "access_programs").Raw)
				assert.Equal(t, "ok", gjson.Get(out, "output.0.content.0.text").String())
				return
			}

			frames := sseFrames(t, out)
			names := make([]string, 0, len(frames))
			for _, frame := range frames {
				names = append(names, frame.event)
			}
			assert.Equal(t, tc.wantFrames, names)
			require.Len(t, frames, len(tc.wantFrames))
			// Events without usage are byte-identical; the terminal event keeps
			// its shape and only its usage object is rebuilt.
			assert.Equal(t, opened, frames[0].data)
			assert.Equal(t, delta, frames[1].data)
			require.JSONEq(t, completedPublic, frames[2].data)
			require.JSONEq(t, tc.wantUsage, gjson.Get(frames[2].data, "response.usage").Raw)
			assert.JSONEq(t, `["codex"]`, gjson.Get(frames[2].data, "response.access_programs").Raw)
			assert.Equal(t, int64(2), gjson.Get(frames[2].data, "sequence_number").Int())
		})
	}
}

func TestOaiResponsesHandlersAcceptUpstreamWithoutUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	const response = `{"id":"resp_1","object":"response","model":"gpt-5.1","status":"completed","output":[]}`
	for _, tc := range []struct {
		name        string
		contentType string
		body        string
		stream      bool
	}{
		{name: "json", contentType: "application/json", body: response},
		{name: "stream", contentType: "text/event-stream", stream: true,
			body: "data: {\"type\":\"response.completed\",\"response\":" + response + "}\n\ndata: [DONE]\n\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			c.Set(common.RequestIdKey, "responses-usage-absent")
			info := &relaycommon.RelayInfo{
				RelayFormat:     types.RelayFormatOpenAIResponses,
				OriginModelName: "gpt-5.1",
				IsStream:        tc.stream,
				DisablePing:     true,
				StartTime:       time.Now(),
				ChannelMeta:     &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeOpenAI, UpstreamModelName: "gpt-5.1"},
			}
			info.SetEstimatePromptTokens(11)
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(tc.body)),
				Header:     http.Header{"Content-Type": []string{tc.contentType}},
			}

			var usage *dto.Usage
			var apiErr *types.NewAPIError
			if tc.stream {
				usage, apiErr = OaiResponsesStreamHandler(c, info, resp)
			} else {
				usage, apiErr = OaiResponsesHandler(c, info, resp)
			}
			require.Nil(t, apiErr)
			require.NotNil(t, usage)

			out := w.Body.String()
			require.NotContains(t, out, `"usage"`)
			if tc.stream {
				frames := sseFrames(t, out)
				require.Len(t, frames, 1)
				require.JSONEq(t, response, gjson.Get(frames[0].data, "response").Raw)
				return
			}
			require.JSONEq(t, response, out)
		})
	}
}

type sseFrame struct {
	event string
	data  string
}

// sseFrames decodes the frame structure a Responses client receives. Every
// frame must still carry exactly one event line and one data payload.
func sseFrames(t *testing.T, body string) []sseFrame {
	t.Helper()
	var frames []sseFrame
	for chunk := range strings.SplitSeq(body, "\n\n") {
		if chunk == "" {
			continue
		}
		var frame sseFrame
		for line := range strings.SplitSeq(chunk, "\n") {
			switch {
			case strings.HasPrefix(line, "event: "):
				frame.event = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				frame.data = strings.TrimPrefix(line, "data: ")
			default:
				t.Fatalf("unexpected stream line %q in frame %q", line, chunk)
			}
		}
		require.NotEmpty(t, frame.event, "frame without an event name: %q", chunk)
		require.True(t, gjson.Valid(frame.data), "frame payload must be valid JSON: %q", frame.data)
		frames = append(frames, frame)
	}
	return frames
}
