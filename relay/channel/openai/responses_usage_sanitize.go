package openai

import (
	"bytes"
	"strings"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// responsesUsagePublicPaths lists the Responses usage fields OpenAI's published
// schema defines. Everything else an upstream reports under usage is its own:
// attribution, for example, names upstream items and splits tokens per message,
// which lets a customer work out which relay is behind us. Values are copied
// from the upstream bytes, never re-encoded, so every token count stays exactly
// as reported.
var responsesUsagePublicPaths = []string{
	"input_tokens",
	"input_tokens_details.cached_tokens",
	"input_tokens_details.cache_write_tokens",
	"input_tokens_details.cache_write_tokens_details.ttl_30m_tokens",
	"input_tokens_details.cache_write_tokens_details.ttl_12h_tokens",
	"output_tokens",
	"output_tokens_details.reasoning_tokens",
	"total_tokens",
}

// responsesUsageMarkerText gates the rewrite: an event without a usage member
// has nothing to rebuild, which keeps the per-fragment cost at one scan.
const responsesUsageMarkerText = `"usage"`

var responsesUsageMarker = []byte(responsesUsageMarkerText)

// SanitizeResponsesResponseUsage rebuilds the top-level usage of one
// non-streaming Responses body. Billing must keep reading the original bytes:
// some channels take upstream tool counts from inside usage
// (usage.x_tools, usage.server_side_tool_usage_details).
func SanitizeResponsesResponseUsage(payload []byte) []byte {
	return sanitizeResponsesUsage(payload, "usage")
}

// SanitizeResponsesEventUsage rebuilds response.usage of one Responses stream
// event, carried either as an SSE data payload or as a WebSocket message.
func SanitizeResponsesEventUsage(payload []byte) []byte {
	return sanitizeResponsesUsage(payload, "response.usage")
}

// sanitizeResponsesEventData is SanitizeResponsesEventUsage for one SSE data
// payload. The marker check avoids copying the fragments that carry no usage.
func sanitizeResponsesEventData(data string) string {
	if !strings.Contains(data, responsesUsageMarkerText) {
		return data
	}
	return string(SanitizeResponsesEventUsage([]byte(data)))
}

func sanitizeResponsesUsage(payload []byte, path string) []byte {
	if len(payload) == 0 || !bytes.Contains(payload, responsesUsageMarker) || !gjson.ValidBytes(payload) {
		return payload
	}
	usage := gjson.GetBytes(payload, path)
	if !usage.IsObject() {
		return payload
	}
	rebuilt := []byte("{}")
	for _, allowed := range responsesUsagePublicPaths {
		value := usage.Get(allowed)
		if !value.Exists() || value.Type == gjson.Null {
			continue
		}
		next, err := sjson.SetRawBytes(rebuilt, allowed, []byte(value.Raw))
		if err != nil {
			// Unreachable: the allow-list is static. Keep the upstream bytes
			// rather than dropping the whole usage object.
			return payload
		}
		rebuilt = next
	}
	sanitized, err := sjson.SetRawBytes(payload, path, rebuilt)
	if err != nil {
		return payload
	}
	return sanitized
}
