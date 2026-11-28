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
	// Keep the bytes around the root object. gjson's root Raw runs to the end
	// of the payload, so trailing whitespace is recovered from its tail.
	raw := root.Raw
	end := len(raw)
	for end > 0 && raw[end-1] <= ' ' {
		end--
	}
	out := make([]byte, 0, root.Index+len(rewritten)+len(raw)-end)
	out = append(out, payload[:root.Index]...)
	out = append(out, rewritten...)
	return append(out, raw[end:]...)
}

// rewriteUsageMember rebuilds the parent object with the member at path
// rebuilt from the allow-list. The first occurrence wins and later duplicates
// are dropped, so a last-key-wins client cannot read an unsanitized copy. A
// null member stays null; a member of the wrong type is omitted.
func rewriteUsageMember(obj gjson.Result, path string, schema usageSchema) ([]byte, bool) {
	if !obj.IsObject() {
		return nil, false
	}
	key, rest, nested := strings.Cut(path, ".")
	var b bytes.Buffer
	b.WriteByte('{')
	first := true
	matched := false
	obj.ForEach(func(k, v gjson.Result) bool {
		if k.String() != key {
			writeUsageMember(&b, &first, k.Raw, v.Raw)
			return true
		}
		if matched {
			return true
		}
		matched = true
		switch {
		case v.Type == gjson.Null:
			// A null member is the upstream's real state; keep it.
			writeUsageMember(&b, &first, k.Raw, "null")
		case !v.IsObject():
			// Type errors are omitted rather than forwarded.
		case nested:
			inner, ok := rewriteUsageMember(v, rest, schema)
			if !ok {
				// The caller resolved the whole path, so keep the member if a
				// malformed duplicate made the resolution ambiguous.
				inner = []byte(v.Raw)
			}
			writeUsageMember(&b, &first, k.Raw, string(inner))
		default:
			writeUsageMember(&b, &first, k.Raw, string(rebuildUsage(v, schema, nil)))
		}
		return true
	})
	if !matched {
		return nil, false
	}
	b.WriteByte('}')
	return b.Bytes(), true
}

func writeUsageMember(b *bytes.Buffer, first *bool, key, value string) {
	if !*first {
		b.WriteByte(',')
	}
	*first = false
	b.WriteString(key)
	b.WriteByte(':')
	b.WriteString(value)
}
