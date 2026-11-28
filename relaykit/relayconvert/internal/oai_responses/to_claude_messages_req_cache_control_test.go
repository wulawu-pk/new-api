package oairesponses

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	relaymedia "github.com/QuantumNous/new-api/relaykit/relayconvert/internal/media"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/require"
)

const dataURL = "data:image/png;base64,aGVsbG8="

// installTestMediaResolver serves every image part from memory so media
// conversion needs no network round trip.
func installTestMediaResolver(t *testing.T) {
	t.Helper()
	relaymedia.SetMediaResolver(relaymedia.MediaResolver{
		GetBase64Data: func(c context.Context, source types.FileSource, reason ...string) (string, string, error) {
			return "aGVsbG8=", "image/png", nil
		},
		DecodeBase64FileData: func(base64String string) (string, string, error) {
			return "aGVsbG8=", "image/png", nil
		},
	})
}

func convertedClaudeJSON(t *testing.T, request *dto.OpenAIResponsesRequest) (map[string]any, *dto.ClaudeRequest) {
	t.Helper()
	converted, err := OpenAIResponsesRequestToClaudeMessages(context.Background(), nil, request)
	require.NoError(t, err)
	require.NotNil(t, converted)
	data, err := json.Marshal(converted)
	require.NoError(t, err)
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(data, &decoded))
	return decoded, converted
}

// requireNoCacheControl fails when any object in the marshaled conversion
// carries a cache_control key, which is how an unrequested breakpoint would
// show up once the field can be populated.
func requireNoCacheControl(t *testing.T, value any) {
	t.Helper()
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			require.NotEqual(t, "cache_control", key, "conversion invented a cache_control key")
			requireNoCacheControl(t, item)
		}
	case []any:
		for _, item := range typed {
			requireNoCacheControl(t, item)
		}
	}
}

func TestOpenAIResponsesRequestToClaudeMessagesKeepsCacheControl(t *testing.T) {
	tests := []struct {
		name  string
		body  string
		check func(t *testing.T, claudeRequest map[string]any)
	}{
		{
			name: "system item text part",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"system","content":[{"type":"input_text","text":"rule","cache_control":{"type":"ephemeral"}}]},` +
				`{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "rule", "cache_control": map[string]any{"type": "ephemeral"}},
				}, claudeRequest["system"])
			},
		},
		{
			name: "only the marked user part",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"user","content":[{"type":"input_text","text":"first"},` +
				`{"type":"input_text","text":"second","cache_control":{"type":"ephemeral"}},` +
				`{"type":"input_text","text":"third"}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				messages := claudeRequest["messages"].([]any)
				require.Len(t, messages, 1)
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "first"},
					map[string]any{"type": "text", "text": "second", "cache_control": map[string]any{"type": "ephemeral"}},
					map[string]any{"type": "text", "text": "third"},
				}, messages[0].(map[string]any)["content"])
			},
		},
		{
			name: "assistant output text part",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"user","content":[{"type":"input_text","text":"hi"}]},` +
				`{"role":"assistant","content":[{"type":"output_text","text":"first"},` +
				`{"type":"output_text","text":"second","cache_control":{"type":"ephemeral"}}]},` +
				`{"role":"user","content":[{"type":"input_text","text":"go on"}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				messages := claudeRequest["messages"].([]any)
				require.Len(t, messages, 3)
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "first"},
					map[string]any{"type": "text", "text": "second", "cache_control": map[string]any{"type": "ephemeral"}},
				}, messages[1].(map[string]any)["content"])
			},
		},
		{
			name: "input image part",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"user","content":[{"type":"input_text","text":"look"},` +
				`{"type":"input_image","image_url":"` + dataURL + `","cache_control":{"type":"ephemeral"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				messages := claudeRequest["messages"].([]any)
				require.Len(t, messages, 1)
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "look"},
					map[string]any{
						"type":          "image",
						"source":        map[string]any{"type": "base64", "media_type": "image/png", "data": "aGVsbG8="},
						"cache_control": map[string]any{"type": "ephemeral"},
					},
				}, messages[0].(map[string]any)["content"])
			},
		},
		{
			name: "whole cache_control object is passed through",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"user","content":[{"type":"input_text","text":"big","cache_control":{"type":"ephemeral","ttl":"1h"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				messages := claudeRequest["messages"].([]any)
				require.Len(t, messages, 1)
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "big", "cache_control": map[string]any{"type": "ephemeral", "ttl": "1h"}},
				}, messages[0].(map[string]any)["content"])
			},
		},
		{
			name: "tool output part",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"user","content":[{"type":"input_text","text":"weather?"}]},` +
				`{"type":"function_call","call_id":"call_1","name":"lookup","arguments":"{}"},` +
				`{"type":"function_call_output","call_id":"call_1","output":[{"type":"input_text","text":"rain","cache_control":{"type":"ephemeral"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				messages := claudeRequest["messages"].([]any)
				require.NotEmpty(t, messages)
				blocks := messages[len(messages)-1].(map[string]any)["content"].([]any)
				require.Len(t, blocks, 1)
				toolResult := blocks[0].(map[string]any)
				require.Equal(t, "tool_result", toolResult["type"])
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "rain", "cache_control": map[string]any{"type": "ephemeral"}},
				}, toolResult["content"])
			},
		},
		{
			name: "no annotation stays absent",
			body: `{"model":"claude-test","max_output_tokens":64,"input":[` +
				`{"role":"system","content":[{"type":"input_text","text":"rule"}]},` +
				`{"role":"user","content":[{"type":"input_text","text":"look"},` +
				`{"type":"input_image","image_url":"` + dataURL + `"}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any) {
				requireNoCacheControl(t, claudeRequest)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			installTestMediaResolver(t)
			var request dto.OpenAIResponsesRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &request))
			claudeRequest, _ := convertedClaudeJSON(t, &request)
			tt.check(t, claudeRequest)
		})
	}
}

// TestOpenAIResponsesRequestToClaudeMessagesBytesUnchangedWithoutCacheControl
// pins the exact bytes the converter produced before cache_control forwarding
// was added. The testdata files were captured from that revision; any drift
// here means a request that carries no annotation now converts differently.
func TestOpenAIResponsesRequestToClaudeMessagesBytesUnchangedWithoutCacheControl(t *testing.T) {
	installTestMediaResolver(t)

	tests := []struct {
		name   string
		golden string
		body   string
	}{
		{
			name:   "instructions and text input",
			golden: "responses-instructions-input.json",
			body:   `{"model":"claude-test","max_output_tokens":64,"instructions":"be nice","input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}`,
		},
		{
			name:   "input text and image parts",
			golden: "responses-input-blocks.json",
			body:   `{"model":"claude-test","max_output_tokens":64,"input":[{"role":"user","content":[{"type":"input_text","text":"look"},{"type":"input_image","image_url":"` + dataURL + `"},{"type":"input_text","text":"done"}]},{"role":"assistant","content":[{"type":"output_text","text":"seen"}]}]}`,
		},
		{
			name:   "tool call and tool output",
			golden: "responses-tool-items.json",
			body:   `{"model":"claude-test","max_output_tokens":64,"input":[{"role":"user","content":[{"type":"input_text","text":"weather?"}]},{"type":"function_call","call_id":"call_1","name":"lookup","arguments":"{\"city\":\"Oslo\"}"},{"type":"function_call_output","call_id":"call_1","output":"rain"}]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var request dto.OpenAIResponsesRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &request))
			converted, err := OpenAIResponsesRequestToClaudeMessages(context.Background(), nil, &request)
			require.NoError(t, err)
			got, err := json.Marshal(converted)
			require.NoError(t, err)

			want, err := os.ReadFile(filepath.Join("testdata", tt.golden))
			require.NoError(t, err)
			require.Equal(t, string(want), string(append(got, '\n')))
		})
	}
}
