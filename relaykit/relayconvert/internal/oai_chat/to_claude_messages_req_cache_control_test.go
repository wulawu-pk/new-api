package oaichat

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	relaymedia "github.com/QuantumNous/new-api/relaykit/relayconvert/internal/media"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
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

func convertedClaudeJSON(t *testing.T, request dto.GeneralOpenAIRequest) (map[string]any, *dto.ClaudeRequest) {
	t.Helper()
	converted, err := OpenAIChatRequestToClaudeMessages(context.Background(), nil, request)
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
// show up after the field gained a non-omitempty value.
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

func TestOpenAIChatRequestToClaudeMessagesKeepsCacheControl(t *testing.T) {
	tests := []struct {
		name  string
		body  string
		check func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest)
	}{
		{
			name: "system text block",
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"system","content":[{"type":"text","text":"rule","cache_control":{"type":"ephemeral"}}]},` +
				`{"role":"user","content":"hi"}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "rule", "cache_control": map[string]any{"type": "ephemeral"}},
				}, claudeRequest["system"])
			},
		},
		{
			name: "only the marked user part",
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"user","content":[{"type":"text","text":"first"},` +
				`{"type":"text","text":"second","cache_control":{"type":"ephemeral"}},` +
				`{"type":"text","text":"third"}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
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
			name: "assistant text block",
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"user","content":"hi"},` +
				`{"role":"assistant","content":[{"type":"text","text":"first"},` +
				`{"type":"text","text":"second","cache_control":{"type":"ephemeral"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
				messages := claudeRequest["messages"].([]any)
				require.Len(t, messages, 2)
				require.Equal(t, []any{
					map[string]any{"type": "text", "text": "first"},
					map[string]any{"type": "text", "text": "second", "cache_control": map[string]any{"type": "ephemeral"}},
				}, messages[1].(map[string]any)["content"])
			},
		},
		{
			name: "image part",
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"user","content":[{"type":"text","text":"look"},` +
				`{"type":"image_url","image_url":{"url":"` + dataURL + `"},"cache_control":{"type":"ephemeral"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
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
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"user","content":[{"type":"text","text":"big","cache_control":{"type":"ephemeral","ttl":"1h"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
				require.Len(t, converted.Messages, 1)
				blocks, ok := converted.Messages[0].Content.([]dto.ClaudeMediaMessage)
				require.True(t, ok)
				require.Len(t, blocks, 1)
				assert.JSONEq(t, `{"type":"ephemeral","ttl":"1h"}`, string(blocks[0].CacheControl))
			},
		},
		{
			name: "no annotation stays absent",
			body: `{"model":"claude-test","max_tokens":64,"messages":[` +
				`{"role":"system","content":[{"type":"text","text":"rule"}]},` +
				`{"role":"user","content":[{"type":"text","text":"look"},` +
				`{"type":"image_url","image_url":{"url":"` + dataURL + `"}}]}]}`,
			check: func(t *testing.T, claudeRequest map[string]any, converted *dto.ClaudeRequest) {
				requireNoCacheControl(t, claudeRequest)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			installTestMediaResolver(t)
			var request dto.GeneralOpenAIRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &request))
			claudeRequest, converted := convertedClaudeJSON(t, request)
			tt.check(t, claudeRequest, converted)
		})
	}
}

// TestOpenAIChatRequestToClaudeMessagesBytesUnchangedWithoutCacheControl pins
// the exact bytes the converter produced before cache_control forwarding was
// added. The testdata files were captured from that revision; any drift here
// means a request that carries no annotation now converts differently.
func TestOpenAIChatRequestToClaudeMessagesBytesUnchangedWithoutCacheControl(t *testing.T) {
	installTestMediaResolver(t)

	tests := []struct {
		name   string
		golden string
		body   string
	}{
		{
			name:   "system and user strings",
			golden: "chat-system-and-user.json",
			body:   `{"model":"claude-test","max_tokens":64,"messages":[{"role":"system","content":"be nice"},{"role":"user","content":"hi"},{"role":"assistant","content":"hello"},{"role":"user","content":"go on"}]}`,
		},
		{
			name:   "system text blocks",
			golden: "chat-system-blocks.json",
			body:   `{"model":"claude-test","max_tokens":64,"messages":[{"role":"system","content":[{"type":"text","text":"rule one"},{"type":"text","text":"rule two"}]},{"role":"user","content":"hi"}]}`,
		},
		{
			name:   "user text and image parts",
			golden: "chat-user-blocks.json",
			body:   `{"model":"claude-test","max_tokens":64,"messages":[{"role":"user","content":[{"type":"text","text":"look"},{"type":"image_url","image_url":{"url":"` + dataURL + `"}},{"type":"text","text":"done"}]},{"role":"assistant","content":"seen"}]}`,
		},
		{
			name:   "tool calls and tool result",
			golden: "chat-tool-calls.json",
			body:   `{"model":"claude-test","max_tokens":64,"messages":[{"role":"user","content":"weather?"},{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\"city\":\"Oslo\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"rain"}]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var request dto.GeneralOpenAIRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &request))
			converted, err := OpenAIChatRequestToClaudeMessages(context.Background(), nil, request)
			require.NoError(t, err)
			got, err := json.Marshal(converted)
			require.NoError(t, err)

			want, err := os.ReadFile(filepath.Join("testdata", tt.golden))
			require.NoError(t, err)
			require.Equal(t, string(want), string(append(got, '\n')))
		})
	}
}
