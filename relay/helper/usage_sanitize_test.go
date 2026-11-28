package helper

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestWireUsageSchema(t *testing.T) {
	for _, tc := range []struct {
		name, raw, want string
		clean           func([]byte) []byte
	}{
		{"nested chat", `{"id":"p","usage":{"total_tokens":9007199254740993,"cost":3,"prompt_tokens_details":{"cached_tokens":-1,"cache_write_tokens":1,"cache_creation_input_tokens":2,"cached_creation_tokens":3,"cached_tokens_details":{"audio_tokens":1e2,"private":1}},"completion_tokens_details":{"rejected_prediction_tokens":0,"private":3}},"usage":{"cost":4}}`, `{"id":"p","usage":{"total_tokens":9007199254740993,"prompt_tokens_details":{"cached_tokens":-1,"cache_write_tokens":1,"cache_creation_input_tokens":2,"cached_creation_tokens":3,"cached_tokens_details":{"audio_tokens":1e2}},"completion_tokens_details":{"rejected_prediction_tokens":0}}}`, SanitizeChatUsageBytes},
		{"surrounding bytes", `  { "id": 1, "response" : { "usage": {"total_tokens":1e2,"private":4}, "id":"r" } } `, `  { "id": 1, "response" : { "usage": {"total_tokens":1e2}, "id":"r" } } `, func(p []byte) []byte { return SanitizeResponsesUsageAt(p, "response.usage") }},
		{"duplicate count", `{"input_tokens":-1,"input_tokens":3,"input_tokens_details":{},"cost":2}`, `{"input_tokens":-1,"input_tokens_details":{}}`, SanitizeResponsesUsageObject},
		{"invalid", `{"usage":{`, `{"usage":{`, SanitizeChatUsageBytes}, {"absent", "", "", SanitizeChatUsageBytes}, {"null", `{"usage":null}`, `{"usage":null}`, SanitizeChatUsageBytes}, {"type", `{"usage":[]}`, `{}`, SanitizeChatUsageBytes}, {"nested type", `{"response":{"usage":0,"id":1}}`, `{"response":{"id":1}}`, func(p []byte) []byte { return SanitizeResponsesUsageAt(p, "response.usage") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.clean([]byte(tc.raw))
			require.Equal(t, tc.want, string(got))
			if gjson.Valid(tc.raw) {
				require.True(t, gjson.ValidBytes(got))
			}
		})
	}
}
