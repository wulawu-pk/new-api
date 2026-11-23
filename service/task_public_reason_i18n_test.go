package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Public task reasons are stored and sent to the console in English (the
// console translates them); API callers get them in their stated language.
func TestPublicTaskFailureLocalizedForApiCallers(t *testing.T) {
	require.NoError(t, i18n.Init())
	for _, tc := range []struct {
		lang, raw, want string
	}{
		{"zh-CN", "request blocked by moderation", "内容审核未通过，请调整内容后重试"},
		{"zh-TW", "request blocked by moderation", "內容審核未通過，請調整內容後重試"},
		{"en", "request blocked by moderation", PublicTaskFailureContentPolicy},
		{"zh-CN", "seconds must be one of 4, 8", "参数不符合要求，请检查后重试"},
		{"en", "Task timed out", PublicTaskFailureTimeout},
		{"zh-CN", "Task timed out", "生成超时，请稍后重试"},
		{"zh-CN", leakyTaskFailReason, "生成失败，请稍后重试"},
		{"zh-TW", leakyTaskFailReason, "生成失敗，請稍後重試"},
		{"en", leakyTaskFailReason, PublicTaskFailureFailed},
		{"zh-CN", legacyTimedOutTaskReason, "任务超时（旧系统遗留任务，不进行退款，请联系管理员）"},
	} {
		_, message := PublicTaskFailureIn(tc.lang, tc.raw)
		assert.Equal(t, tc.want, message, tc.lang+" "+tc.raw)
		assert.NotContains(t, message, "supergpt")
	}
	// Every English message has a translation in each backend language.
	for en, key := range publicTaskFailureKeys {
		for _, lang := range i18n.SupportedLanguages() {
			text := i18n.Translate(lang, key)
			assert.NotEqual(t, key, text, lang+" "+key)
			if lang == i18n.LangEn {
				assert.Equal(t, en, text)
			}
		}
	}
}

func TestPublicTaskFailReasonForFollowsAcceptLanguage(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	for header, want := range map[string]string{
		"zh-CN,zh;q=0.9": "生成失败，请稍后重试",
		"zh-TW":          "生成失敗，請稍後重試",
		"en-US,en;q=0.9": PublicTaskFailureFailed,
	} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("GET", "/v1/video/generations/x", nil)
		c.Request.Header.Set("Accept-Language", header)
		assert.Equal(t, want, PublicTaskFailReasonFor(c, "something odd"), header)
	}
}
