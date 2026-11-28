package helper

import (
	"bytes"
	"strings"

	"github.com/tidwall/gjson"
)

// A nil child denotes a token count. All other members are detail objects.
type usageSchema map[string]usageSchema

var writeDurations = usageSchema{"ttl_30m_tokens": nil, "ttl_12h_tokens": nil}
var responsesUsage = usageSchema{
	"input_tokens": nil, "output_tokens": nil, "total_tokens": nil,
	"input_tokens_details":  {"cached_tokens": nil, "cache_write_tokens": nil, "cache_creation_input_tokens": nil, "cached_creation_tokens": nil, "cache_write_tokens_details": writeDurations},
	"output_tokens_details": {"reasoning_tokens": nil},
}
var chatUsage = usageSchema{
	"prompt_tokens": nil, "completion_tokens": nil, "total_tokens": nil,
	"prompt_tokens_details":     {"cached_tokens": nil, "text_tokens": nil, "audio_tokens": nil, "image_tokens": nil, "cache_write_tokens": nil, "cache_creation_input_tokens": nil, "cached_creation_tokens": nil, "cache_write_tokens_details": writeDurations, "cached_tokens_details": {"text_tokens": nil, "audio_tokens": nil, "image_tokens": nil}},
	"completion_tokens_details": {"text_tokens": nil, "audio_tokens": nil, "image_tokens": nil, "reasoning_tokens": nil, "accepted_prediction_tokens": nil, "rejected_prediction_tokens": nil},
}

func rebuildUsage(obj gjson.Result, schema usageSchema, drop func(string)) []byte {
	var b bytes.Buffer
	b.WriteByte('{')
	seen := make(map[string]bool)
	obj.ForEach(func(k, v gjson.Result) bool {
		name := k.String()
		child, ok := schema[name]
		if !ok || (child == nil && v.Type != gjson.Number) || (child != nil && !v.IsObject()) {
			if drop != nil {
				drop(name)
			}
			if ok {
				seen[name] = true
			}
			return true
		}
		if seen[name] {
			return true
		}
		seen[name] = true
		if b.Len() > 1 {
			b.WriteByte(',')
		}
		b.WriteString(k.Raw)
		b.WriteByte(':')
		if child == nil {
			b.WriteString(v.Raw)
		} else {
			b.Write(rebuildUsage(v, child, drop))
		}
		return true
	})
	b.WriteByte('}')
	return b.Bytes()
}

// RebuildResponsesUsage accepts an already parsed usage object so a response
// writer can collect dropped names without scanning the object again.
func RebuildResponsesUsage(obj gjson.Result, drop func(string)) []byte {
	return rebuildUsage(obj, responsesUsage, drop)
}
func SanitizeResponsesUsageObject(raw []byte) []byte {
	obj := gjson.ParseBytes(raw)
	if !obj.IsObject() || !gjson.ValidBytes(raw) {
		return raw
	}
	return RebuildResponsesUsage(obj, nil)
}
func SanitizeResponsesUsageAt(payload []byte, path string) []byte {
	return sanitizeUsageAt(payload, path, responsesUsage)
}
func SanitizeChatUsageBytes(payload []byte) []byte {
	return sanitizeUsageAt(payload, "usage", chatUsage)
}
func sanitizeUsageAt(payload []byte, path string, schema usageSchema) []byte {
	if !gjson.ValidBytes(payload) {
		return payload
	}
	root := gjson.ParseBytes(payload)
	rewritten, ok := rewriteUsageMember(root, path, schema)
	if !ok {
		return payload
	}
	// Parse starts Raw at the opening brace. Preserve any leading whitespace.
	if root.Index != 0 {
		return append(bytes.Clone(payload[:root.Index]), rewritten...)
	}
	return rewritten
}

// Copy untouched byte spans around the rewritten member, including whitespace.
// Discard later occurrences along the selected path for last-key-wins clients.
func rewriteUsageMember(obj gjson.Result, path string, schema usageSchema) ([]byte, bool) {
	if !obj.IsObject() {
		return nil, false
	}
	key, rest, nested := strings.Cut(path, ".")
	var b bytes.Buffer
	var matched, omit bool
	var cursor, previousEnd int
	obj.ForEach(func(k, v gjson.Result) bool {
		start := v.Index - obj.Index
		end := start + len(v.Raw)
		if k.String() == key {
			if !matched {
				if v.Type == gjson.Null {
					// A null member is the upstream's real state; keep it.
					return false
				}
				if !v.IsObject() {
					// Type errors are omitted rather than forwarded.
					omit = true
					return false
				}
				var replacement []byte
				if nested {
					var ok bool
					replacement, ok = rewriteUsageMember(v, rest, schema)
					if !ok {
						return false
					}
				} else {
					replacement = rebuildUsage(v, schema, nil)
				}
				b.WriteString(obj.Raw[:start])
				b.Write(replacement)
				matched = true
			} else {
				b.WriteString(obj.Raw[cursor:previousEnd])
			}
			cursor = end
		}
		previousEnd = end
		return true
	})
	if omit {
		return dropUsageMember(obj, key)
	}
	if !matched {
		return nil, false
	}
	b.WriteString(obj.Raw[cursor:])
	return b.Bytes(), true
}

// dropUsageMember rebuilds the parent object without the first key member.
// Only a malformed usage member reaches this path, so the byte spans of the
// remaining members are preserved without their original whitespace.
func dropUsageMember(obj gjson.Result, key string) ([]byte, bool) {
	var b bytes.Buffer
	b.WriteByte('{')
	dropped := false
	first := true
	obj.ForEach(func(k, v gjson.Result) bool {
		if !dropped && k.String() == key {
			dropped = true
			return true
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(k.Raw)
		b.WriteByte(':')
		b.WriteString(v.Raw)
		return true
	})
	if !dropped {
		return nil, false
	}
	b.WriteByte('}')
	return b.Bytes(), true
}
