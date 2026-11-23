package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
)

// Public task failure codes. Customers receive one of these instead of the
// upstream's own error code, which can name the provider.
const (
	PublicTaskFailureCodeContentPolicy = "content_policy_violation"
	PublicTaskFailureCodeInvalidParams = "invalid_request"
	PublicTaskFailureCodeTimeout       = "generation_timeout"
	PublicTaskFailureCodeFailed        = "generation_failed"
)

// Public task failure messages. They are fixed text on purpose: an upstream's
// wording (account pools, provider names, URLs, prices) must never reach a
// customer, so nothing from the raw reason is copied into them.
const (
	PublicTaskFailureContentPolicy = "内容审核未通过，请调整内容后重试"
	PublicTaskFailureInvalidParams = "参数不符合要求，请检查后重试"
	PublicTaskFailureTimeout       = "生成超时，请稍后重试"
	PublicTaskFailureLegacyTimeout = "生成超时（旧系统遗留任务不退款，请联系管理员）"
	PublicTaskFailureFailed        = "生成失败，请稍后重试"
)

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

// PublicTaskFailReason returns only the public message of PublicTaskFailure.
func PublicTaskFailReason(raw string) string {
	_, message := PublicTaskFailure(raw)
	return message
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
