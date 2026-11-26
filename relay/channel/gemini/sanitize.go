package gemini

import (
	"bytes"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// upstreamOnlyGeminiPaths are fields a relay upstream adds to native Gemini
// responses that Google's API never returns. They name the relay's own
// billing (billing_usage, usageMetadata.unit) or its session plumbing
// (turnToken), so a customer reading a passed-through native body could tell
// there is another relay behind us. They are dropped from every byte we send
// to the client; billing reads the parsed usageMetadata, never these fields.
var upstreamOnlyGeminiPaths = []string{
	"billing_usage",
	"turnToken",
	"usageMetadata.unit",
	"usageMetadata.billing_usage",
}

// upstreamOnlyGeminiMarkers are substrings at least one of the paths above
// needs; a body without any of them is returned untouched without parsing.
var upstreamOnlyGeminiMarkers = [][]byte{[]byte("billing_usage"), []byte("turnToken"), []byte(`"unit"`)}

// sanitizeNativeGeminiBody removes upstreamOnlyGeminiPaths from one native
// Gemini JSON document (a generateContent body or one SSE data payload).
// Anything that is not a JSON object is returned unchanged.
func sanitizeNativeGeminiBody(data []byte) []byte {
	if len(data) == 0 {
		return data
	}
	found := false
	for _, m := range upstreamOnlyGeminiMarkers {
		if bytes.Contains(data, m) {
			found = true
			break
		}
	}
	if !found || !gjson.ValidBytes(data) || !gjson.ParseBytes(data).IsObject() {
		return data
	}
	for _, path := range upstreamOnlyGeminiPaths {
		if !gjson.GetBytes(data, path).Exists() {
			continue
		}
		if stripped, err := sjson.DeleteBytes(data, path); err == nil {
			data = stripped
		}
	}
	return data
}

func sanitizeNativeGeminiString(data string) string {
	return string(sanitizeNativeGeminiBody([]byte(data)))
}
