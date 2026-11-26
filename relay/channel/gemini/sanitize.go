package gemini

import (
	"bytes"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// peroai fork: a native Gemini body from the upstream is passed through to
// native-format clients. Customers must not be able to tell there is another
// relay behind us, so the body is rebuilt from an allow-list of Google's public
// generateContent schema instead of deleting known extras: anything the
// upstream adds (billing_usage, turnToken, usageMetadata.unit, future fields)
// is dropped by default. Free-form customer data (part text, function
// arguments, inline data, thought signatures) is copied verbatim.
//
// usageMetadata keeps only the top-level counts. The upstream rescales the
// totals but not the per-modality details, so emitting both lets a customer
// derive the conversion factor; the details are optional in Google's schema.

type jsonFilter func(raw string) string

func keep(raw string) string { return raw }

// Protocol leaves accept scalar values only. Function arguments and responses
// have customer-defined schemas and deliberately bypass this restriction.
func scalar(raw string) string {
	if gjson.Parse(raw).Type == gjson.JSON {
		return "null"
	}
	return raw
}

func scalars(raw string) string {
	v := gjson.Parse(raw)
	if !v.IsArray() {
		return "[]"
	}
	for _, item := range v.Array() {
		if item.Type == gjson.JSON {
			return "[]"
		}
	}
	return raw
}

func fields(names ...string) map[string]jsonFilter {
	keys := make(map[string]jsonFilter, len(names))
	for _, name := range names {
		keys[name] = scalar
	}
	return keys
}

func object(keys map[string]jsonFilter) jsonFilter {
	return func(raw string) string { return filterObject(raw, keys) }
}
func objects(keys map[string]jsonFilter) jsonFilter {
	return func(raw string) string { return filterArray(raw, keys) }
}

var mediaKeys = map[string]jsonFilter{
	"inlineData": object(fields("mimeType", "data", "displayName")),
	"fileData":   object(fields("mimeType", "fileUri", "displayName")),
}
var geminiPartKeys = map[string]jsonFilter{
	"text": scalar, "thought": scalar, "thoughtSignature": scalar,
	"inlineData": mediaKeys["inlineData"], "fileData": mediaKeys["fileData"],
	"functionCall": object(map[string]jsonFilter{
		"id": scalar, "name": scalar, "args": keep, "willContinue": scalar,
		"partialArgs": objects(fields("jsonPath", "numberValue", "stringValue", "boolValue", "nullValue", "willContinue")),
	}),
	"functionResponse": object(map[string]jsonFilter{
		"id": scalar, "name": scalar, "response": keep, "willContinue": scalar, "scheduling": scalar, "parts": objects(mediaKeys),
	}),
	"executableCode": object(fields("language", "code")), "codeExecutionResult": object(fields("outcome", "output")),
	"videoMetadata": object(fields("startOffset", "endOffset", "fps")), "mediaResolution": object(fields("level", "numTokens")),
}

var safetyRatings = objects(fields("category", "probability", "probabilityScore", "severity", "severityScore", "blocked", "overwrittenThreshold"))
var groundingMetadata = object(map[string]jsonFilter{
	"webSearchQueries": scalars, "imageSearchQueries": scalars, "retrievalQueries": scalars, "googleMapsWidgetContextToken": scalar,
	"searchEntryPoint":   object(fields("renderedContent", "sdkBlob")),
	"retrievalMetadata":  object(fields("googleSearchDynamicRetrievalScore")),
	"sourceFlaggingUris": objects(fields("sourceId", "flagContentUri")),
	"groundingChunks": objects(map[string]jsonFilter{
		"web": object(fields("uri", "title", "domain")), "image": object(fields("sourceUri", "imageUri", "title", "domain")),
		"retrievedContext": object(fields("uri", "title", "text", "documentName", "fileSearchStore")),
		"maps": object(map[string]jsonFilter{"uri": scalar, "title": scalar, "text": scalar, "placeId": scalar,
			"placeAnswerSources": object(map[string]jsonFilter{"reviewSnippets": objects(fields("reviewId", "googleMapsUri", "title"))})}),
	}),
	"groundingSupports": objects(map[string]jsonFilter{
		"segment": object(fields("partIndex", "startIndex", "endIndex", "text")), "groundingChunkIndices": scalars, "confidenceScores": scalars,
	}),
})
var logprobCandidates = objects(fields("token", "tokenId", "logProbability"))

var geminiUsageKeys = fields("promptTokenCount", "candidatesTokenCount", "totalTokenCount", "thoughtsTokenCount", "cachedContentTokenCount", "toolUsePromptTokenCount")

var geminiContentKeys = map[string]jsonFilter{"role": scalar, "parts": objects(geminiPartKeys)}
var geminiCandidateKeys = map[string]jsonFilter{
	"content": object(geminiContentKeys), "finishReason": scalar, "index": scalar, "tokenCount": scalar,
	"safetyRatings": safetyRatings, "groundingMetadata": groundingMetadata, "avgLogprobs": scalar,
	"citationMetadata": object(map[string]jsonFilter{"citationSources": objects(map[string]jsonFilter{
		"startIndex": scalar, "endIndex": scalar, "uri": scalar, "license": scalar,
		"publicationDate": object(fields("year", "month", "day")),
	})}),
	"urlContextMetadata": object(map[string]jsonFilter{"urlMetadata": objects(fields("retrievedUrl", "urlRetrievalStatus"))}),
	"logprobsResult":     object(map[string]jsonFilter{"topCandidates": objects(map[string]jsonFilter{"candidates": logprobCandidates}), "chosenCandidates": logprobCandidates, "logProbabilitySum": scalar}),
}

var geminiPromptFeedbackKeys = map[string]jsonFilter{
	"blockReason":   func(raw string) string { return strconv.Quote(publicBlockReason(gjson.Parse(raw).String())) },
	"safetyRatings": safetyRatings,
}

func geminiResponseKeys(withUsage bool) map[string]jsonFilter {
	keys := map[string]jsonFilter{
		"candidates":     func(raw string) string { return filterArray(raw, geminiCandidateKeys) },
		"promptFeedback": func(raw string) string { return filterObject(raw, geminiPromptFeedbackKeys) },
		"modelVersion":   scalar,
		"responseId":     scalar,
	}
	if withUsage {
		keys["usageMetadata"] = func(raw string) string { return filterObject(raw, geminiUsageKeys) }
	}
	return keys
}

// geminiCamelCase normalizes protobuf JSON aliases at protocol boundaries.
func geminiCamelCase(name string) string {
	if !strings.Contains(name, "_") {
		return name
	}
	var result strings.Builder
	first := true
	for part := range strings.SplitSeq(name, "_") {
		if part == "" {
			return name
		}
		if !first && part[0] >= 'a' && part[0] <= 'z' {
			result.WriteByte(part[0] - 'a' + 'A')
			part = part[1:]
		}
		result.WriteString(part)
		first = false
	}
	return result.String()
}

// Match the DTO decoder's case folding and the public projection's aliases.
// Business objects are opaque and are never inspected or re-encoded.
func ambiguousGeminiFields(v gjson.Result, parent string, depth int, alias func(gjson.Result, string)) bool {
	if v.Type != gjson.JSON {
		return false
	}
	if depth > 128 {
		return true
	}
	seen := map[string]bool{}
	ambiguous := false
	v.ForEach(func(k, item gjson.Result) bool {
		name := geminiCamelCase(k.String())
		if v.IsObject() {
			key := strings.ToLower(name)
			if seen[key] {
				ambiguous = true
				return false
			}
			seen[key] = true
		}
		if (parent == "functionCall" && name == "args") || (parent == "functionResponse" && name == "response") {
			return true
		}
		if alias != nil && k.Str != name && v.IsObject() {
			alias(k, name)
		}
		childAlias := alias
		if k.Str == "billing_usage" {
			childAlias = nil
		}
		ambiguous = ambiguousGeminiFields(item, name, depth+1, childAlias)
		return !ambiguous
	})
	return ambiguous
}

// filterObject rebuilds a JSON object with only the allowed keys, in their
// original order, keeping the first occurrence of a duplicated key.
func filterObject(raw string, allowed map[string]jsonFilter) string {
	obj := gjson.Parse(raw)
	if !obj.IsObject() {
		return "{}"
	}
	var b bytes.Buffer
	b.WriteByte('{')
	seen := map[string]bool{}
	obj.ForEach(func(k, v gjson.Result) bool {
		name := k.String()
		filter, ok := allowed[name]
		if !ok && strings.Contains(name, "_") {
			name = geminiCamelCase(name)
			filter, ok = allowed[name]
		}
		if !ok || seen[name] {
			return true
		}
		seen[name] = true
		if b.Len() > 1 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.Quote(name))
		b.WriteByte(':')
		b.WriteString(filter(v.Raw))
		return true
	})
	b.WriteByte('}')
	return b.String()
}

func filterArray(raw string, itemKeys map[string]jsonFilter) string {
	arr := gjson.Parse(raw)
	if !arr.IsArray() {
		return "[]"
	}
	var b bytes.Buffer
	b.WriteByte('[')
	n := 0
	arr.ForEach(func(_, v gjson.Result) bool {
		if !v.IsObject() {
			return true
		}
		if n > 0 {
			b.WriteByte(',')
		}
		b.WriteString(filterObject(v.Raw, itemKeys))
		n++
		return true
	})
	b.WriteByte(']')
	return b.String()
}

// Project usage after Claude conversion, which may synthesize billing details.
func publicClaudeJSON(response *dto.ClaudeResponse) ([]byte, error) {
	data, err := common.Marshal(response)
	if err != nil {
		return nil, err
	}
	for _, path := range []string{"usage", "message.usage"} {
		if usage := gjson.GetBytes(data, path); usage.IsObject() {
			public := filterObject(usage.Raw, publicClaudeUsageKeys)
			data, err = sjson.SetRawBytes(data, path, []byte(public))
			if err != nil {
				return nil, err
			}
		}
	}
	return data, nil
}

var publicClaudeUsageKeys = fields("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")

// sanitizeNativeGeminiBody returns the public form of one native Gemini JSON
// document (a generateContent body). Anything that is not a JSON object is
// returned unchanged; callers parse it before this point.
func sanitizeNativeGeminiBody(data []byte) []byte {
	return sanitizeNativeGemini(data, true)
}

func sanitizeNativeGemini(data []byte, withUsage bool) []byte {
	if len(data) == 0 || !gjson.ValidBytes(data) || !gjson.ParseBytes(data).IsObject() {
		return data
	}
	return []byte(filterObject(string(data), geminiResponseKeys(withUsage)))
}

var geminiEmbeddingItemKeys = map[string]jsonFilter{
	"values": keep,
}

var geminiEmbeddingKeys = map[string]jsonFilter{
	"embedding":  func(raw string) string { return filterObject(raw, geminiEmbeddingItemKeys) },
	"embeddings": func(raw string) string { return filterArray(raw, geminiEmbeddingItemKeys) },
}

func sanitizeNativeGeminiEmbeddingBody(data []byte) []byte {
	if len(data) == 0 || !gjson.ValidBytes(data) || !gjson.ParseBytes(data).IsObject() {
		return data
	}
	return []byte(filterObject(string(data), geminiEmbeddingKeys))
}

// publicBlockReasons are Google's documented BlockReason values; anything else
// the upstream puts there is free text and is reported as OTHER.
var publicBlockReasons = map[string]bool{
	"BLOCK_REASON_UNSPECIFIED": true, "SAFETY": true, "OTHER": true, "BLOCKLIST": true,
	"PROHIBITED_CONTENT": true, "IMAGE_SAFETY": true,
}

func publicBlockReason(reason string) string {
	if publicBlockReasons[reason] {
		return reason
	}
	return "OTHER"
}

func invalidGeminiResponse(message string) *types.NewAPIError {
	err := types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	err.MarkUpstream()
	return err
}

func geminiEmbeddingError(data []byte, batch bool) *types.NewAPIError {
	if err := geminiEnvelopeError(data); err != nil {
		return err
	}
	single := gjson.GetBytes(data, "embedding")
	array := gjson.GetBytes(data, "embeddings")
	if (batch && single.Exists()) || (!batch && array.Exists()) {
		return invalidGeminiResponse("unexpected embedding response shape")
	}
	items := []gjson.Result{single}
	if batch {
		if !array.IsArray() {
			return invalidGeminiResponse("missing embeddings array")
		}
		items = array.Array()
		if len(items) == 0 {
			return invalidGeminiResponse("empty embeddings array")
		}
	}
	for _, item := range items {
		values := item.Get("values")
		if !item.IsObject() || !values.IsArray() || len(values.Array()) == 0 {
			return invalidGeminiResponse("invalid embedding item")
		}
		for _, value := range values.Array() {
			if value.Type != gjson.Number {
				return invalidGeminiResponse("invalid embedding value")
			}
		}
	}
	return nil
}

// geminiEnvelopeError turns an error object inside a 2xx Gemini body (or a
// stream frame) into an upstream error, so it leaves through the neutral
// customer error (service.PublicUpstreamError) instead of being copied out.
// The original text stays in the error for the admin log.
func geminiEnvelopeError(data []byte) *types.NewAPIError {
	_, err := prepareGeminiDocument(data)
	return err
}

// Normalize only protocol keys before both accounting and conversion. Copy spans
// of the original document so tool arguments, binary data and billing snapshots
// retain their original encoding. Ordinary camel-case frames need no copy.
func prepareGeminiDocument(data []byte) ([]byte, *types.NewAPIError) {
	root := gjson.ParseBytes(data)
	var normalized bytes.Buffer
	start := 0
	alias := func(k gjson.Result, name string) {
		if geminiPartKeys[name] == nil && geminiCandidateKeys[name] == nil && geminiUsageKeys[name] == nil {
			switch name {
			case "usageMetadata", "promptFeedback", "blockReason", "modelVersion", "responseId", "mimeType", "fileUri", "partialArgs", "willContinue", "jsonPath", "numberValue", "boolValue", "stringValue", "nullValue", "webSearchQueries", "imageSearchQueries", "promptTokensDetails", "candidatesTokensDetails", "toolUsePromptTokensDetails", "tokenCount":
			default:
				return
			}
		}
		normalized.Write(data[start:k.Index])
		normalized.WriteString(strconv.Quote(name))
		start = k.Index + len(k.Raw)
	}
	if !gjson.ValidBytes(data) || !root.IsObject() || ambiguousGeminiFields(root, "", 0, alias) {
		return nil, invalidGeminiResponse("invalid or ambiguous Gemini response document")
	}
	e := root.Get("error")
	if !e.Exists() || e.Type == gjson.Null {
		if start != 0 {
			normalized.Write(data[start:])
			data = normalized.Bytes()
		}
		return data, nil
	}
	status := int(e.Get("code").Int())
	if status < 400 || status > 599 {
		status = http.StatusBadGateway
	}
	msg := e.Get("message").String()
	if msg == "" {
		msg = e.Raw
	}
	apiErr := types.WithOpenAIError(types.OpenAIError{
		Message: "upstream error in response body: " + msg,
		Type:    "upstream_error",
		Code:    "gemini_upstream_error",
	}, status)
	apiErr.MarkUpstream()
	return nil, apiErr
}

// publicGeminiUsage is the usage a customer sees on converted (chat /
// responses) replies: totals only, no billing_usage and no per-modality
// details, which come from a different count than the totals.
func publicGeminiUsage(u dto.Usage) dto.Usage {
	out := u
	out.BillingUsage = nil
	out.UsageSemantic = ""
	out.UsageSource = ""
	out.PromptTokensDetails = dto.InputTokenDetails{CachedTokens: u.PromptTokensDetails.CachedTokens}
	out.InputTokensDetails = nil
	if u.InputTokensDetails != nil {
		out.InputTokensDetails = &dto.InputTokenDetails{CachedTokens: u.InputTokensDetails.CachedTokens}
	}
	out.CompletionTokenDetails = dto.OutputTokenDetails{ReasoningTokens: u.CompletionTokenDetails.ReasoningTokens}
	if u.OutputTokensDetails != nil {
		out.OutputTokensDetails = &dto.OutputTokenDetails{ReasoningTokens: u.OutputTokensDetails.ReasoningTokens}
	}
	return out
}

func publicGeminiUsagePtr(u *dto.Usage) *dto.Usage {
	if u == nil {
		return nil
	}
	p := publicGeminiUsage(*u)
	return &p
}

var publicCachedDetailKeys = map[string]jsonFilter{"cached_tokens": keep}
var publicReasoningDetailKeys = map[string]jsonFilter{"reasoning_tokens": keep}

// publicUsageKeys is the OpenAI-shaped usage a customer may see on converted
// Gemini replies (chat and responses).
var publicUsageKeys = map[string]jsonFilter{
	"prompt_tokens": keep, "completion_tokens": keep, "total_tokens": keep,
	"input_tokens": keep, "output_tokens": keep,
	"prompt_tokens_details":     func(raw string) string { return filterObject(raw, publicCachedDetailKeys) },
	"input_tokens_details":      func(raw string) string { return filterObject(raw, publicCachedDetailKeys) },
	"completion_tokens_details": func(raw string) string { return filterObject(raw, publicReasoningDetailKeys) },
	"output_tokens_details":     func(raw string) string { return filterObject(raw, publicReasoningDetailKeys) },
}

// scrubUsageAt replaces the usage object at path with its public form.
func scrubUsageAt(data []byte, path string) []byte {
	u := gjson.GetBytes(data, path)
	if !u.IsObject() {
		return data
	}
	if out, err := sjson.SetRawBytes(data, path, []byte(filterObject(u.Raw, publicUsageKeys))); err == nil {
		return out
	}
	return data
}

// publicStreamFailureMessage is what a customer sees when a converted stream
// fails after it started. Upstream errors get the same neutral text as the
// non-stream exits; anything else gets the generic unavailable text.
func publicStreamFailureMessage(c *gin.Context, err error) string {
	var apiErr *types.NewAPIError
	if errors.As(err, &apiErr) && apiErr != nil {
		return service.PublicUpstreamError(c, apiErr).Error()
	}
	return i18n.T(c, i18n.MsgRelayUpstreamUnavailable)
}
