package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// peroai fork: a rate-limited task submission keeps its 429, and the customer
// message names the group, not where the limit came from.
func TestRespondTaskErrorRateLimitIsNeutral(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	previous := common.DefaultLanguage
	t.Cleanup(func() { common.DefaultLanguage = previous })
	common.DefaultLanguage = "zh-CN"

	for _, tc := range []struct {
		acceptLanguage string
		want           string
	}{
		{"", "当前分组繁忙，请稍后重试"},
		{"zh-CN", "当前分组繁忙，请稍后重试"},
		{"zh-TW", "目前分組繁忙，請稍後重試"},
		{"en-US,en;q=0.9", "The current group is busy. Please try again later"},
	} {
		t.Run(tc.acceptLanguage, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
			if tc.acceptLanguage != "" {
				c.Request.Header.Set("Accept-Language", tc.acceptLanguage)
			}

			respondTaskError(c, &taskdto.TaskError{
				Code:       "rate_limit_error",
				Message:    "raw limit text",
				StatusCode: http.StatusTooManyRequests,
			})

			assert.Equal(t, http.StatusTooManyRequests, recorder.Code)
			var body map[string]any
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
			assert.Equal(t, tc.want, body["message"])
			text := strings.ToLower(recorder.Body.String())
			for _, word := range []string{"upstream", "上游", "raw limit text"} {
				assert.NotContains(t, text, word)
			}
		})
	}
}
