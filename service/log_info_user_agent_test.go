package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func adminInfoOf(t *testing.T, other *model.LogOther) map[string]any {
	t.Helper()
	snapshot := other.Snapshot()
	raw, ok := snapshot["admin_info"]
	require.True(t, ok, "the log should carry an admin-only section")
	adminInfo, ok := raw.(map[string]any)
	require.True(t, ok, "admin_info should be an object, got %T", raw)
	return adminInfo
}

func userAgentContext(userAgent string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	if userAgent != "" {
		c.Request.Header.Set("User-Agent", userAgent)
	}
	return c
}

// The console shows the client that sent a request next to the endpoint, so the
// relay has to keep the User-Agent with the log.
func TestAppendRelayLogAdminInfoRecordsTheUserAgent(t *testing.T) {
	other := model.NewLogOther()

	AppendRelayLogAdminInfo(userAgentContext("claude-cli/2.1.98 (external, cli)"), nil, other)

	assert.Equal(t, "claude-cli/2.1.98 (external, cli)", adminInfoOf(t, other)["user_agent"])
}

// A request without a User-Agent must not create an empty cell, and a huge one
// must not bloat every log row.
func TestAppendRelayLogAdminInfoBoundsTheUserAgent(t *testing.T) {
	t.Run("missing", func(t *testing.T) {
		other := model.NewLogOther()
		AppendRelayLogAdminInfo(userAgentContext(""), nil, other)
		_, present := adminInfoOf(t, other)["user_agent"]
		assert.False(t, present)
	})
	t.Run("padded", func(t *testing.T) {
		other := model.NewLogOther()
		AppendRelayLogAdminInfo(userAgentContext("   "+"codex_cli_rs/0.160 "+strings.Repeat("x", 400)+"   "), nil, other)
		userAgent := adminInfoOf(t, other)["user_agent"].(string)
		assert.LessOrEqual(t, len(userAgent), loggedUserAgentMaxBytes)
		assert.True(t, strings.HasPrefix(userAgent, "codex_cli_rs/0.160 "), userAgent)
		assert.NotContains(t, userAgent, "  ", "the value is trimmed")
	})
	t.Run("multibyte tail", func(t *testing.T) {
		other := model.NewLogOther()
		// A cut through a multi-byte rune must not leave invalid UTF-8 behind.
		AppendRelayLogAdminInfo(userAgentContext(strings.Repeat("客", 200)), nil, other)
		userAgent := adminInfoOf(t, other)["user_agent"].(string)
		assert.LessOrEqual(t, len(userAgent), loggedUserAgentMaxBytes)
		assert.NotContains(t, userAgent, "\uFFFD")
		for _, r := range userAgent {
			require.NotEqual(t, rune(0xFFFD), r)
		}
	})
}

// The User-Agent is a diagnostic: it must not reach the customer-facing view.
func TestAppendRelayLogAdminInfoKeepsTheUserAgentAdminOnly(t *testing.T) {
	other := model.NewLogOther()

	AppendRelayLogAdminInfo(userAgentContext("codex_cli_rs/0.160"), nil, other)

	assert.NotContains(t, other.Snapshot(), "user_agent", "top-level keys are public")
	assert.Equal(t, "codex_cli_rs/0.160", adminInfoOf(t, other)["user_agent"])
}
