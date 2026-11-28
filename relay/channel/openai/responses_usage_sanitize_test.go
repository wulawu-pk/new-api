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
			sanitize:  func(p []byte) []byte { return SanitizeResponsesResponse(p, nil, nil) },
			usagePath: "usage",
			payload: `{"id":"resp_1","object":"response","created_at":1764300000,"model":"gpt-5.1","status":"completed",` +
				`"access_programs":["codex"],"output":[{"type":"message","id":"msg_public","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],` +
				`"usage":` + upstreamAttributionUsage + `}`,
			wantUsage: publicAttributionUsage,
			preserved: []string{"id", "object", "created_at", "model", "status", "output"},
		},
		{
			name:      "stream event",
			sanitize:  func(p []byte) []byte { return SanitizeResponsesEvent(p, nil, nil) },
			usagePath: "response.usage",
			payload: `{"type":"response.completed","sequence_number":7,"response":{"id":"resp_1","object":"response","status":"completed",` +
				`"access_programs":["codex"],"usage":` + upstreamAttributionUsage + `}}`,
			wantUsage: publicAttributionUsage,
			preserved: []string{"type", "sequence_number", "response.id", "response.object", "response.status"},
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
			wantUsage: `{"input_tokens":7,"input_tokens_details":{"cached_tokens":3,"cache_creation_input_tokens":4,"cached_creation_tokens":4},"output_tokens":2,"output_tokens_details":{"reasoning_tokens":1},"total_tokens":9}`,
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

// A usage member of the wrong type is omitted rather than forwarded; a null
// member is the upstream's own state and stays null.
func TestResponsesUsageTypeErrorsAreOmitted(t *testing.T) {
	for _, tc := range []struct {
		name    string
		clean   func([]byte) []byte
		payload string
		want    string
	}{
		{"event usage string", SanitizeResponsesEventUsage, `{"type":"response.completed","response":{"usage":"none","id":"r"}}`, `{"type":"response.completed","response":{"id":"r"}}`},
		{"body usage array", SanitizeResponsesResponseUsage, `{"id":"r","usage":[]}`, `{"id":"r"}`},
		{"full event rebuild", func(p []byte) []byte { return SanitizeResponsesEvent(p, nil, nil) }, `{"type":"response.completed","response":{"usage":"none","id":"r"}}`, `{"type":"response.completed","response":{"id":"r"}}`},
		{"null usage stays", func(p []byte) []byte { return SanitizeResponsesEvent(p, nil, nil) }, `{"type":"response.created","response":{"usage":null,"id":"r"}}`, `{"type":"response.created","response":{"usage":null,"id":"r"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, string(tc.clean([]byte(tc.payload))))
		})
	}
}

func TestResponsesSSEEchoWithNewlinesStaysOneFrame(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	// A client may send a pretty-printed request; echoed values then carry
	// literal newlines and must still produce one well-formed SSE frame.
	const clientBody = "{\n  \"model\": \"gpt-5.1\",\n  \"tools\": [\n    {\"type\": \"function\", \"name\": \"f\"}\n  ]\n}"
	const upstream = `{"type":"response.created","sequence_number":0,"response":{"id":"r","instructions":"private","tools":[{"type":"leak"}]}}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set(common.RequestIdKey, "responses-sse-newlines")
	storage, err := common.CreateBodyStorage([]byte(clientBody))
	require.NoError(t, err)
	defer storage.Close()
	c.Set(common.KeyBodyStorage, storage)
	info := &relaycommon.RelayInfo{
		RelayFormat:     types.RelayFormatOpenAIResponses,
		OriginModelName: "gpt-5.1",
		IsStream:        true,
		DisablePing:     true,
		StartTime:       time.Now(),
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.1"},
		Request:         &dto.OpenAIResponsesRequest{Model: "gpt-5.1"},
	}
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader("data: " + upstream + "\n\ndata: [DONE]\n\n")),
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
	}

	_, apiErr := OaiResponsesStreamHandler(c, info, resp)
	require.Nil(t, apiErr)

	out := w.Body.String()
	payloads := sseDataPayloads(t, out)
	require.Len(t, payloads, 1)
	require.True(t, gjson.Valid(payloads[0]), "reassembled frame must stay valid JSON: %q", payloads[0])
	require.Equal(t, gjson.Get(clientBody, "tools").Raw, gjson.Get(payloads[0], "response.tools").Raw)
	require.False(t, gjson.Get(payloads[0], "response.instructions").Exists())
	require.NotContains(t, out, `{"type":"leak"}`)
}

// sseDataPayloads reassembles each SSE frame's data lines the way a client
// does, so a payload that spans several "data:" lines is still one JSON value.
func sseDataPayloads(t *testing.T, body string) []string {
	t.Helper()
	var payloads []string
	for chunk := range strings.SplitSeq(body, "\n\n") {
		if chunk == "" {
			continue
		}
		var data []string
		for line := range strings.SplitSeq(chunk, "\n") {
			switch {
			case strings.HasPrefix(line, "event: "):
			case strings.HasPrefix(line, "data: "):
				data = append(data, strings.TrimPrefix(line, "data: "))
			default:
				t.Fatalf("unexpected stream line %q in frame %q", line, chunk)
			}
		}
		require.NotEmpty(t, data, "frame without data: %q", chunk)
		payloads = append(payloads, strings.Join(data, "\n"))
	}
	return payloads
}

func TestWebSearchActionDropsNonStringQueries(t *testing.T) {
	raw := `{"output":[{"type":"web_search_call","action":{"type":"search","queries":["ok",{"private":1},"also"],"private":"x"}}]}`
	audit := relaycommon.NewResponsesSanitizeAudit()
	out := SanitizeResponsesResponse([]byte(raw), nil, audit)
	require.JSONEq(t, `{"output":[{"type":"web_search_call","action":{"type":"search","queries":["ok","also"]}}]}`, string(out))
	require.Contains(t, audit.Map()["dropped_fields"], "queries")
}

func TestStructuredItemFields(t *testing.T) {
	for _, tc := range []struct {
		name, raw, want string
	}{
		{"file search queries", `{"output":[{"type":"file_search_call","queries":["ok",{"private":1}],"results":[]}]}`, `{"output":[{"type":"file_search_call","queries":["ok"],"results":[]}]}`},
		{"mcp arguments stay free-form", `{"output":[{"type":"mcp_call","arguments":{"q":1,"private":"x"}}]}`, `{"output":[{"type":"mcp_call","arguments":{"q":1,"private":"x"}}]}`},
		{"mcp approval arguments array", `{"output":[{"type":"mcp_approval_request","arguments":[1,2]}]}`, `{"output":[{"type":"mcp_approval_request","arguments":[1,2]}]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, string(SanitizeResponsesResponse([]byte(tc.raw), nil, nil)))
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
	completedPublic := strings.NewReplacer(upstreamAttributionUsage, publicAttributionUsage, `"access_programs":["codex"],`, "").Replace(completed)

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
			body:        "data: " + opened + "\n\ndata: {\"type\":\"codex.rate_limits\",\"balance\":44}\n\ndata: " + delta + "\n\ndata: " + completed + "\n\ndata: [DONE]\n\n",
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
				assert.False(t, gjson.Get(out, "access_programs").Exists())
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
			assert.False(t, gjson.Get(frames[2].data, "response.access_programs").Exists())
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

func TestResponsesEchoSources(t *testing.T) {
	for _, tc := range []struct {
		name         string
		stored, want string
		info         *relaycommon.RelayInfo
	}{{"original", `{"instructions":"raw\u0020request","store":false}`, `{"instructions":"raw\u0020request","store":false}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesRequest{Instructions: []byte(`"fallback"`)}}}, {"original omitted", `{}`, `{}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesRequest{Instructions: []byte(`"fallback"`)}}}, {"invalid cache", `{`, `{"instructions":"fallback"}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesRequest{Instructions: []byte(`"fallback"`)}}}, {"compact dto", "", `{"instructions":null}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesCompactionRequest{Instructions: []byte(`null`)}}}, {"input excluded", "", `{"instructions":"fallback"}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesRequest{Instructions: []byte(`"fallback"`), Input: []byte(`"a large input"`)}}}, {"empty dto", "", `{}`, &relaycommon.RelayInfo{Request: &dto.OpenAIResponsesRequest{}}}} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			if tc.stored != "" {
				storage, err := common.CreateBodyStorage([]byte(tc.stored))
				require.NoError(t, err)
				defer storage.Close()
				c.Set(common.KeyBodyStorage, storage)
			}
			echo := ExtractResponsesEchoFields(c, tc.info)
			require.Equal(t, tc.want, string(SanitizeResponsesResponse([]byte(`{"instructions":"private"}`), echo, nil)))
		})
	}
}

func TestResponseEchoAndPrivateFields(t *testing.T) {
	const raw = `{"id":"resp\u0031","created_at":9007199254740993,"status":"completed","model":"gpt","instructions":"internal prompt","safety_identifier":"internal prompt","access_programs":{},"image":{},"prompt_cache_retention":"24h","prompt_cache_key":"secret","tool_usage":{},"input_transformations":[],"output":[{"type":"message","phase":"final","content":[{"type":"output_text","text":"phase\u0021"}]}],"usage":{"input_tokens":-1,"attribution":{}}}`
	for _, request := range []string{`{}`, `{"instructions":"client\u0020only","temperature":0,"store":false,"service_tier":null,"metadata":{},"user":""}`} {
		t.Run(request, func(t *testing.T) {
			a := relaycommon.NewResponsesSanitizeAudit()
			wire := SanitizeResponsesResponse([]byte(raw), ExtractResponsesEchoFieldsFromBytes([]byte(request)), a)
			require.True(t, gjson.ValidBytes(wire))
			for _, key := range strings.Fields("id created_at status model output.0.content.0.text usage.input_tokens") {
				require.Equal(t, gjson.Get(raw, key).Raw, gjson.GetBytes(wire, key).Raw, key)
			}
			for _, key := range strings.Fields("instructions temperature store service_tier metadata user") {
				require.Equal(t, gjson.Get(request, key).Raw, gjson.GetBytes(wire, key).Raw, key)
			}
			for _, key := range strings.Fields("safety_identifier access_programs image prompt_cache_retention prompt_cache_key tool_usage input_transformations output.0.phase usage.attribution") {
				require.False(t, gjson.GetBytes(wire, key).Exists(), key)
			}
			require.NotContains(t, string(wire), "internal prompt")
			require.NotContains(t, string(wire), "dropped_fields")
			require.Contains(t, a.Map()["dropped_fields"], "attribution")
		})
	}
}

func TestChatWireUsageByRoute(t *testing.T) {
	old := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = old })
	const response = `{"id":"r","model":"gpt-test","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}`
	const stream = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\ndata: {\"type\":\"response.completed\",\"response\":" + response + "}\n\ndata: [DONE]\n\n"
	const chat = `{"id":"deepseek","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"prompt_cache_hit_tokens":3}}`
	for _, tc := range []struct {
		name, body string
		handler    func(*gin.Context, *relaycommon.RelayInfo, *http.Response) (*dto.Usage, *types.NewAPIError)
	}{{"responses", response, OaiResponsesToChatHandler}, {"buffered", stream, OaiResponsesToChatBufferedStreamHandler}, {"stream", stream, OaiResponsesToChatStreamHandler}, {"compatible chat", chat, OpenaiHandler}} {
		t.Run(tc.name, func(t *testing.T) {
			c, w, resp, info := newResponsesChatTestContext(t, tc.body, tc.name == "stream")
			usage, e := tc.handler(c, info, resp)
			require.Nil(t, e)
			require.Equal(t, 7, usage.TotalTokens)
			wire := w.Body.String()
			if tc.name == "compatible chat" {
				require.Equal(t, chat, wire)
				return
			}
			require.Contains(t, wire, `"prompt_tokens":5`)
			for _, key := range []string{"input_tokens", "usage_source", "billing_usage", "usage_semantic"} {
				require.NotContains(t, wire, `"`+key+`"`)
			}
		})
	}
}

func TestResponseOutputTypeMatrix(t *testing.T) {
	for _, tc := range []struct{ types, field string }{{"message", `"content":[{"type":"output_text","text":"ok"}]`}, {"reasoning", `"summary":[{"type":"summary_text","text":"ok"}]`}, {"compaction", `"encrypted_content":"cipher"`}, {"function_call mcp_call mcp_approval_request", `"arguments":"{}"`}, {"function_call_output custom_tool_call_output local_shell_call_output shell_call_output apply_patch_call_output computer_call_output", `"output":"ok"`}, {"custom_tool_call", `"input":"abc"`}, {"web_search_call", `"action":{"sources":[{"type":"url","url":"x"}]}`}, {"file_search_call", `"results":[{"score":1e-3}]`}, {"image_generation_call", `"result":"x"`}, {"code_interpreter_call", `"outputs":[{"type":"logs","logs":"ok"}]`}, {"mcp_list_tools", `"tools":[{"name":"abc"}]`}, {"mcp_approval_response", `"approve":false`}, {"local_shell_call shell_call", `"action":{"command":["a"]}`}, {"apply_patch_call", `"operation":{"path":"x"}`}, {"computer_call", `"action":{"x":2}`}, {"item_reference", `"id":"i"`}} {
		for _, typ := range strings.Fields(tc.types) {
			t.Run(typ, func(t *testing.T) {
				item := `{"type":"` + typ + `",` + tc.field + `}`
				raw := `{"output":[` + strings.TrimSuffix(item, "}") + `,"private":1},{"type":"new_item"}]}`
				a := relaycommon.NewResponsesSanitizeAudit()
				out := SanitizeResponsesResponse([]byte(raw), nil, a)
				require.Equal(t, `{"output":[`+item+`]}`, string(out))
				require.Equal(t, []string{"new_item"}, a.Map()["dropped_item_types"])
			})
		}
	}
}
func TestResponsesScalarFrameFastPath(t *testing.T) {
	for _, raw := range []string{` { "type":"response.output_text.delta", "item_id":"i", "delta":"abc" } `, `{"sequence_number":9487526782598712,"type":"response.done"}`} {
		payload := []byte(raw)
		out := SanitizeResponsesEvent(payload, nil, nil)
		require.Same(t, &payload[0], &out[0])
		require.Zero(t, testing.AllocsPerRun(100, func() { SanitizeResponsesEvent(payload, nil, nil) }))
	}
}

func TestResponseNestedBoundaries(t *testing.T) {
	for _, tc := range []struct{ kind, raw, want string }{
		{"response", `{"error":null,"incomplete_details":null,"usage":null,"output":{}}`, `{"error":null,"incomplete_details":null,"usage":null}`}, {"response", `{"error":[],"usage":0,"incomplete_details":"x","output":[{}]}`, `{"output":[]}`}, {"response", `{"id":"first","id":"second","output":[{"type":"message","content":[{"type":"future"}]}]}`, `{"id":"first","output":[{"type":"message","content":[]}]}`},
		{"event", `{"type":"response.output_item.done","item":{"type":"future"}}`, ``}, {"event", `{"type":"response.output_item.done","item":{"type":"message","phase":"final"}}`, `{"type":"response.output_item.done","item":{"type":"message"}}`}, {"event", `{"type":"response.content_part.done","part":{"type":"output_text","text":"ok","annotations":[{"type":"url_citation","private":false}],"logprobs":[{"logprob":-1e2,"top_logprobs":[{"token":"a","private":0}]}]}}`, `{"type":"response.content_part.done","part":{"type":"output_text","text":"ok","annotations":[{"type":"url_citation"}],"logprobs":[{"logprob":-1e2,"top_logprobs":[{"token":"a"}]}]}}`},
		{"event", `{"type":"error","error":{"type":"bad","code":"c","message":"m","private":1},"delta":"x"}`, `{"type":"error","error":{"type":"bad","code":"c","message":"m"}}`},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			a := relaycommon.NewResponsesSanitizeAudit()
			var got []byte
			if tc.kind == "event" {
				got = SanitizeResponsesEvent([]byte(tc.raw), nil, a)
			} else {
				got = SanitizeResponsesResponse([]byte(tc.raw), nil, a)
			}
			require.Equal(t, tc.want, string(got))
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
