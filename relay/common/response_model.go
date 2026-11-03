package common

import (
	"strings"
	"unicode"
)

// ResponseModel records upstream declarations before response conversion. It is
// diagnostic only: it must never change routing, pricing, or downstream output.
// Only the three names are stored; whether they disagree is computed on demand
// so every consumer applies the current comparison rule to old rows as well.
type ResponseModel struct {
	RequestedModel string `json:"requested_model"`
	UpstreamModel  string `json:"upstream_model"`
	ReturnedModel  string `json:"returned_model"`
}

// normalizeModelName folds a model name into its comparison form: lower case
// with separators removed, so provider spellings such as "claude-sonnet-5-5"
// and "claude-sonnet-5.5" compare equal. Dropping every separator also erases
// differences that come from runs or mixes of them ("a---b", "a.b" -> "ab").
// Path segments keep their slashes: they are part of the provider namespace,
// not of the model name.
func normalizeModelName(name string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r == '-' || r == '.' || r == '_' || unicode.IsSpace(r):
			return -1
		default:
			return unicode.ToLower(r)
		}
	}, name)
}

// matches reports whether an upstream declaration is compatible with the
// requested or upstream model: equal up to separators and case, a dated or
// variant name that extends it, or the same name behind a provider path such
// as "deepseek/deepseek-v4.1-flash".
func (r *ResponseModel) matches(model string) bool {
	returned := normalizeModelName(model)
	for _, expected := range []string{r.RequestedModel, r.UpstreamModel} {
		expected = normalizeModelName(expected)
		if expected != "" && (strings.HasPrefix(returned, expected) || strings.HasSuffix(returned, expected)) {
			return true
		}
	}
	return false
}

// Mismatch reports whether the retained upstream declaration disagrees with
// both the requested and upstream models.
func (r *ResponseModel) Mismatch() bool {
	return r != nil && r.ReturnedModel != "" && !r.matches(r.ReturnedModel)
}

// ObserveResponseModel retains the first differing model for inspection, with
// mismatches taking priority over provider-path, prefix, or separator-only
// differences. A later matching or empty event cannot erase it. Only observe
// upstream declarations, never models synthesized by a response converter.
func (info *RelayInfo) ObserveResponseModel(model string) {
	if info == nil || strings.TrimSpace(model) == "" {
		return
	}
	if info.ResponseModel == nil {
		info.ResponseModel = &ResponseModel{
			RequestedModel: info.OriginModelName,
			UpstreamModel:  info.GetUpstreamModelName(),
		}
	}
	observation := info.ResponseModel
	if observation.Mismatch() {
		return
	}
	if observation.matches(model) && observation.ReturnedModel != "" &&
		observation.ReturnedModel != observation.RequestedModel && observation.ReturnedModel != observation.UpstreamModel {
		return
	}
	observation.ReturnedModel = model
}
