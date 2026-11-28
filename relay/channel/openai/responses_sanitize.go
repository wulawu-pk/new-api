package openai

import (
	"bytes"
	"strings"
	"unsafe"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// Each field has one bit within its object, for first-occurrence semantics.
// A suffix after ':' names the nested schema; 'raw' is protocol-defined free-form JSON.
type responseField struct {
	bit  uint64
	kind string
}
type responseSchema map[string]responseField

func fields(spec string) responseSchema {
	s := responseSchema{}
	for i, entry := range strings.Fields(spec) {
		name, kind, _ := strings.Cut(entry, ":")
		s[name] = responseField{1 << i, kind}
	}
	return s
}

var echoSchema = fields("instructions safety_identifier user prompt_cache_key prompt_cache_retention metadata store tools tool_choice temperature top_p text reasoning truncation max_output_tokens parallel_tool_calls top_logprobs max_tool_calls prompt background previous_response_id conversation context_management service_tier")

type ResponsesEchoFields struct{ members []byte }

func ExtractResponsesEchoFieldsFromBytes(body []byte) *ResponsesEchoFields {
	if !gjson.ValidBytes(body) {
		return nil
	}
	obj := gjson.ParseBytes(body)
	if !obj.IsObject() {
		return nil
	}
	var b bytes.Buffer
	var seen uint64
	obj.ForEach(func(k, v gjson.Result) bool {
		f := echoSchema[k.String()]
		if f.bit != 0 && seen&f.bit == 0 {
			seen |= f.bit
			if b.Len() > 0 {
				b.WriteByte(',')
			}
			b.WriteString(k.Raw)
			b.WriteByte(':')
			b.WriteString(v.Raw)
		}
		return true
	})
	return &ResponsesEchoFields{b.Bytes()}
}
func ExtractResponsesEchoFields(c *gin.Context, info *relaycommon.RelayInfo) *ResponsesEchoFields {
	if c != nil {
		v, _ := c.Get(common.KeyBodyStorage)
		if storage, ok := v.(common.BodyStorage); ok && !storage.IsDisk() {
			if raw, err := storage.Bytes(); err == nil {
				if echo := ExtractResponsesEchoFieldsFromBytes(raw); echo != nil {
					return echo
				}
			}
		}
	}
	if info != nil {
		switch info.Request.(type) {
		case *dto.OpenAIResponsesRequest, *dto.OpenAIResponsesCompactionRequest:
			raw, err := common.Marshal(info.Request)
			if err == nil {
				return ExtractResponsesEchoFieldsFromBytes(raw)
			}
		}
	}
	return nil
}

var responseSchemas = map[string]responseSchema{
	"response":      fields("id object created_at completed_at status model output:[]item usage:usage error:responseError incomplete_details:incomplete"),
	"compact":       fields("id object created_at output:[]item usage:usage error:responseError"),
	"event":         fields("type sequence_number item_id output_index content_index summary_index annotation_index delta text refusal arguments input name call_id code message param obfuscation partial_image_b64 partial_image_index logprobs:[]logprob status event_id stream_id response_id response:response item:item part:part annotation:annotation error:eventError"),
	"errorEvent":    fields("type sequence_number status event_id stream_id response_id code message param error:eventError"),
	"responseError": fields("code message"), "incomplete": fields("reason"), "eventError": fields("type code message param"),
	"annotation": fields("type url title start_index end_index file_id filename index container_id"), "logprob": fields("token bytes:raw logprob top_logprobs:[]token"), "token": fields("token bytes:raw logprob"),
	"webAction": fields("type query queries:raw url pattern sources:[]source"), "source": fields("type url"), "result": fields("file_id filename score text attributes:raw"), "codeOutput": fields("type logs url"), "tool": fields("name description input_schema:raw annotations:raw"),
	"shellAction": fields("type command:raw commands:raw timeout_ms working_directory env:raw user max_output_length"), "operation": fields("type path diff"), "computerAction": fields("type x y button keys:raw text scroll_x scroll_y path:raw ms"), "check": fields("id code message"),
}
var itemSchemas = map[string]responseSchema{
	"message": fields("id type status role content:[]part"), "reasoning": fields("id type status summary:[]reasonPart content:[]reasonPart encrypted_content"), "compaction": fields("id type encrypted_content"),
	"function_call": fields("id type status call_id name namespace arguments"), "function_call_output": fields("id type status call_id output:raw"), "custom_tool_call": fields("id type status call_id name namespace input"), "custom_tool_call_output": fields("id type status call_id output:raw"),
	"web_search_call": fields("id type status action:webAction"), "file_search_call": fields("id type status queries:raw results:[]result"), "image_generation_call": fields("id type status result revised_prompt quality size background output_format"), "code_interpreter_call": fields("id type status container_id code outputs:[]codeOutput"),
	"mcp_call": fields("id type status server_label name arguments output:raw error:raw approval_request_id"), "mcp_list_tools": fields("id type server_label tools:[]tool error:raw"), "mcp_approval_request": fields("id type server_label name arguments"), "mcp_approval_response": fields("id type approval_request_id approve reason"),
	"local_shell_call": fields("id type status call_id action:shellAction"), "shell_call": fields("id type status call_id action:shellAction"), "local_shell_call_output": fields("id type status call_id output:raw max_output_length"), "shell_call_output": fields("id type status call_id output:raw max_output_length"),
	"apply_patch_call": fields("id type status call_id operation:operation"), "apply_patch_call_output": fields("id type status call_id output:raw"), "computer_call": fields("id type status call_id action:computerAction pending_safety_checks:[]check"), "computer_call_output": fields("id type status call_id output:raw acknowledged_safety_checks:[]check"), "item_reference": fields("id type"),
}
var partSchemas = map[string]responseSchema{
	"output_text": fields("type text annotations:[]annotation logprobs:[]logprob"), "refusal": fields("type refusal"), "summary_text": fields("type text"), "reasoning_text": fields("type text"), "input_text": fields("type text"), "input_image": fields("type image_url file_id detail"), "input_file": fields("type file_id filename file_data file_url"), "input_audio": fields("type data format"),
}
var allowedEvents = func() map[string]bool {
	events := map[string]bool{"error": true}
	for prefix, suffixes := range map[string]string{
		"response":             "created in_progress queued completed incomplete failed done cancelled canceled error",
		"response.output_item": "added done", "response.content_part": "added done", "response.output_text": "delta done", "response.output_text.annotation": "added", "response.refusal": "delta done", "response.function_call_arguments": "delta done", "response.custom_tool_call_input": "delta done", "response.reasoning_summary_part": "added done", "response.reasoning_summary_text": "delta done", "response.reasoning_text": "delta done",
		"response.file_search_call": "in_progress searching completed", "response.web_search_call": "in_progress searching completed", "response.image_generation_call": "in_progress generating partial_image completed", "response.mcp_call": "in_progress completed failed", "response.mcp_call_arguments": "delta done", "response.mcp_list_tools": "in_progress completed failed", "response.code_interpreter_call": "in_progress interpreting completed", "response.code_interpreter_call_code": "delta done", "response.audio": "delta done", "response.audio.transcript": "delta done",
	} {
		for _, suffix := range strings.Fields(suffixes) {
			events[prefix+"."+suffix] = true
		}
	}
	return events
}()

type responseWriter struct {
	bytes.Buffer
	echo  *ResponsesEchoFields
	audit *relaycommon.ResponsesSanitizeAudit
}

func (w *responseWriter) value(v gjson.Result, kind string) bool {
	if element, ok := strings.CutPrefix(kind, "[]"); ok {
		if !v.IsArray() {
			return false
		}
		w.WriteByte('[')
		first := true
		v.ForEach(func(_, entry gjson.Result) bool {
			start := w.Len()
			if !first {
				w.WriteByte(',')
			}
			if w.value(entry, element) {
				first = false
			} else {
				w.Truncate(start)
			}
			return true
		})
		w.WriteByte(']')
		return true
	}
	switch kind {
	case "", "raw":
		if kind == "" && v.Type == gjson.JSON {
			return false
		}
		w.WriteString(v.Raw)
		return true
	case "responseError", "incomplete", "usage", "eventError":
		if v.Type == gjson.Null {
			w.WriteString("null")
			return true
		}
	}
	if !v.IsObject() {
		return false
	}
	schema := responseSchemas[kind]
	switch kind {
	case "usage":
		w.Write(helper.RebuildResponsesUsage(v, w.audit.AddDroppedField))
		return true
	case "item", "part", "reasonPart":
		name := v.Get("type").String()
		if kind == "item" {
			schema = itemSchemas[name]
		} else {
			schema = partSchemas[name]
			if kind == "reasonPart" && schema != nil {
				schema = partSchemas["reasoning_text"]
			}
		}
		if schema == nil {
			w.audit.AddDroppedItemType(name)
			return false
		}
	}
	w.object(v, schema, kind == "response")
	return true
}
func (w *responseWriter) member(k, v gjson.Result, f responseField, seen *uint64, begin int) {
	if f.bit == 0 {
		w.audit.AddDroppedField(k.String())
		return
	}
	if *seen&f.bit != 0 {
		return
	}
	*seen |= f.bit
	start := w.Len()
	if start > begin {
		w.WriteByte(',')
	}
	w.WriteString(k.Raw)
	w.WriteByte(':')
	if !w.value(v, f.kind) {
		w.Truncate(start)
		w.audit.AddDroppedField(k.String())
	}
}

func (w *responseWriter) object(obj gjson.Result, schema responseSchema, withEcho bool) {
	w.WriteByte('{')
	begin := w.Len()
	var seen uint64
	obj.ForEach(func(k, v gjson.Result) bool {
		w.member(k, v, schema[k.String()], &seen, begin)
		return true
	})
	if withEcho && w.echo != nil && len(w.echo.members) > 0 {
		if w.Len() > begin {
			w.WriteByte(',')
		}
		w.Write(w.echo.members)
	}
	w.WriteByte('}')
}
func SanitizeResponsesResponse(payload []byte, echo *ResponsesEchoFields, audit *relaycommon.ResponsesSanitizeAudit) []byte {
	return sanitizeResponseRoot(payload, "response", echo, audit)
}
func SanitizeResponsesCompactionResponse(payload []byte, audit *relaycommon.ResponsesSanitizeAudit) []byte {
	return sanitizeResponseRoot(payload, "compact", nil, audit)
}
func SanitizeResponsesEvent(payload []byte, echo *ResponsesEchoFields, audit *relaycommon.ResponsesSanitizeAudit) []byte {
	return sanitizeResponseRoot(payload, "event", echo, audit)
}
func sanitizeResponseRoot(payload []byte, kind string, echo *ResponsesEchoFields, audit *relaycommon.ResponsesSanitizeAudit) []byte {
	if !gjson.ValidBytes(payload) {
		return payload
	}
	// ParseBytes copies the payload into a string on every frame; the view is
	// read-only and never outlives this call, so borrow the bytes instead.
	obj := gjson.Parse(unsafe.String(unsafe.SliceData(payload), len(payload)))
	if !obj.IsObject() {
		return payload
	}
	schema := responseSchemas[kind]
	if kind == "event" {
		name := obj.Get("type").String()
		if !allowedEvents[name] {
			audit.AddDroppedFrame(name)
			return nil
		}
		if name == "error" || name == "response.error" {
			schema = responseSchemas["errorEvent"]
		}
		// Defer allocation until the first member that needs rewriting. The
		// already verified scalar prefix can be copied without scanning it again.
		w := responseWriter{echo: echo, audit: audit}
		prefixEnd := 1
		var seen uint64
		var sawItem, withheld bool
		obj.ForEach(func(k, v gjson.Result) bool {
			key := k.String()
			if key == "item" && !sawItem {
				sawItem = true
				if v.IsObject() {
					itemType := v.Get("type").String()
					if itemSchemas[itemType] == nil {
						audit.AddDroppedItemType(itemType)
						audit.AddDroppedFrame(name)
						withheld = true
						return false
					}
				}
			}
			f := schema[key]
			if w.Len() == 0 {
				if f.bit != 0 && f.kind == "" && seen&f.bit == 0 && v.Type != gjson.JSON {
					seen |= f.bit
					prefixEnd = v.Index - obj.Index + len(v.Raw)
					return true
				}
				w.WriteString(obj.Raw[:prefixEnd])
			}
			w.member(k, v, f, &seen, 1)
			return true
		})
		if withheld {
			return nil
		}
		if w.Len() == 0 {
			return payload
		}
		w.WriteByte('}')
		return w.Bytes()
	}
	w := responseWriter{echo: echo, audit: audit}
	w.object(obj, schema, kind == "response")
	return w.Bytes()
}
