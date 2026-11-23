package service

import (
	"strings"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// Public task failure codes. Customers receive one of these instead of the
// upstream's own error code, which can name the provider.
const (
	PublicTaskFailureCodeContentPolicy = "content_policy_violation"
	PublicTaskFailureCodeInvalidParams = "invalid_request"
	PublicTaskFailureCodeTimeout       = "generation_timeout"
	PublicTaskFailureCodeFailed        = "generation_failed"
)

// Public task failure messages, in English. They are fixed text on purpose: an
// upstream's wording (account pools, provider names, URLs, prices) must never
// reach a customer, so nothing from the raw reason is copied into them.
//
// The English text is also the language-neutral form: the web console and
// stored refund logs carry it and the console translates it into the reader's
// interface language. API callers get it in their own language through
// PublicTaskFailureIn (i18n keys task.fail.*).
const (
	PublicTaskFailureContentPolicy = "Content moderation failed. Please adjust the content and try again."
	PublicTaskFailureInvalidParams = "Invalid parameters. Please check and try again."
	PublicTaskFailureTimeout       = "Generation timed out. Please try again later."
	PublicTaskFailureLegacyTimeout = legacyTimedOutTaskReason
	PublicTaskFailureFailed        = "Generation failed. Please try again later."
)

// publicTaskFailureKeys maps each English message to its i18n key.
var publicTaskFailureKeys = map[string]string{
	PublicTaskFailureContentPolicy: i18n.MsgTaskFailContentPolicy,
	PublicTaskFailureInvalidParams: i18n.MsgTaskFailInvalidParams,
	PublicTaskFailureTimeout:       i18n.MsgTaskFailTimeout,
	PublicTaskFailureLegacyTimeout: i18n.MsgTaskFailLegacyTimeout,
	PublicTaskFailureFailed:        i18n.MsgTaskFailGeneric,
}

// legacyTimedOutTaskReason is the host's own reason for timed-out tasks left by
// the old system (service/task_polling.go); those are not refunded, which the
// customer must still be told.
const legacyTimedOutTaskReason = "Task timed out (a task left by the old system is not refunded; contact the administrator)"

// Reasons that describe our side of the upstream (credentials, balance,
// account pools, routing) are not the customer's to act on, so they fall back
// to the generic message even when they also mention a parameter.
var publicTaskInternalKeywords = []string{
	"api key", "api_key", "apikey", "unauthorized", "forbidden", "credential",
	"quota", "balance", "insufficient", "billing", "payment", "credit",
	"account", "pool", "rate limit", "rate_limit", "too many requests",
	"overloaded", "capacity", "no available", "channel", "upstream", "proxy",
}

var publicTaskTimeoutKeywords = []string{
	"timed out", "timeout", "time out", "deadline exceeded", "expired", "超时",
}

var publicTaskContentPolicyKeywords = []string{
	"moderation", "content policy", "content_policy", "safety", "sensitive",
	"nsfw", "inappropriate", "violat", "prohibited", "datainspection",
	"harmful", "flagged", "censor", "blocked", "审核", "敏感", "违规", "违禁",
}

var publicTaskInvalidParamsKeywords = []string{
	"invalid", "parameter", "unsupported", "not supported", "must be",
	"out of range", "exceeds", "too long", "too large", "malformed",
	"bad request", "参数", "不支持", "格式",
}

func containsAnyKeyword(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

// PublicTaskFailure maps a raw task failure reason to a stable public code and
// message. Unrecognised reasons, including empty ones, become the generic
// "generation failed" pair. The raw reason stays available to administrators
// (task lists, refund log admin_info.upstream_reason).
func PublicTaskFailure(raw string) (code string, message string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == legacyTimedOutTaskReason {
		return PublicTaskFailureCodeTimeout, PublicTaskFailureLegacyTimeout
	}
	text := strings.ToLower(trimmed)
	switch {
	case text == "":
		return PublicTaskFailureCodeFailed, PublicTaskFailureFailed
	case containsAnyKeyword(text, publicTaskTimeoutKeywords):
		return PublicTaskFailureCodeTimeout, PublicTaskFailureTimeout
	case containsAnyKeyword(text, publicTaskContentPolicyKeywords):
		return PublicTaskFailureCodeContentPolicy, PublicTaskFailureContentPolicy
	case containsAnyKeyword(text, publicTaskInternalKeywords):
		return PublicTaskFailureCodeFailed, PublicTaskFailureFailed
	case containsAnyKeyword(text, publicTaskInvalidParamsKeywords):
		return PublicTaskFailureCodeInvalidParams, PublicTaskFailureInvalidParams
	default:
		return PublicTaskFailureCodeFailed, PublicTaskFailureFailed
	}
}

// PublicTaskFailReason returns only the public (English) message of
// PublicTaskFailure.
func PublicTaskFailReason(raw string) string {
	_, message := PublicTaskFailure(raw)
	return message
}

// localizePublicTaskFailure translates an English public message into lang.
// An empty lang means the reader stated none (common.DefaultLanguage). An
// unknown message, or a missing translation, keeps the English text.
func localizePublicTaskFailure(lang, message string) string {
	key, ok := publicTaskFailureKeys[message]
	if !ok {
		return message
	}
	if err := i18n.Init(); err != nil {
		return message
	}
	if text := i18n.Translate(lang, key); text != "" && text != key {
		return text
	}
	return message
}

// PublicTaskFailureIn is PublicTaskFailure with the message in lang.
func PublicTaskFailureIn(lang, raw string) (code string, message string) {
	code, message = PublicTaskFailure(raw)
	return code, localizePublicTaskFailure(lang, message)
}

// PublicTaskFailReasonFor is the public reason in the language the reader of
// the request stated (account setting, then Accept-Language), for API
// responses that no console translates.
func PublicTaskFailReasonFor(c *gin.Context, raw string) string {
	_, message := PublicTaskFailureIn(i18n.StatedLang(c), raw)
	return message
}

// PublicTaskFailReasonForTaskIn is PublicTaskFailReasonForTask in lang.
func PublicTaskFailReasonForTaskIn(lang string, task *model.Task) string {
	reason := PublicTaskFailReasonForTask(task)
	if reason == "" {
		return ""
	}
	return localizePublicTaskFailure(lang, reason)
}

// PublicTaskFailReasonForTask is the fail_reason a customer may see for task:
// a public message for failed tasks and nothing otherwise. Successful legacy
// tasks keep their result URL in FailReason, so it is never passed through.
func PublicTaskFailReasonForTask(task *model.Task) string {
	if task == nil || task.Status != model.TaskStatusFailure {
		return ""
	}
	return PublicTaskFailReason(task.FailReason)
}
