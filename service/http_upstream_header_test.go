package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShouldCopyUpstreamHeaderAllowList(t *testing.T) {
	allowed := []string{
		"Content-Type",
		"content-disposition",
		"Cache-Control",
		"Retry-After",
		"X-Ratelimit-Remaining-Requests",
		"x-ratelimit-reset-tokens",
		"anthropic-ratelimit-requests-remaining",
		"Openai-Processing-Ms",
		"X-Reasoning-Included",
		"X-Codex-Turn-State",
	}
	for _, name := range allowed {
		assert.True(t, ShouldCopyUpstreamHeader(nil, name, []string{"v"}), name)
	}
	blocked := []string{
		"Content-Length",
		"Content-Encoding",
		"X-Request-Id",
		"X-Client-Request-Id",
		"Request-Id",
		"Access-Control-Expose-Headers",
		"Access-Control-Allow-Origin",
		"Via",
		"Server",
		"Strict-Transport-Security",
		"X-Frame-Options",
		"Referrer-Policy",
		"Vary",
		"Cf-Ray",
		"Cf-Cache-Status",
		"Set-Cookie",
		"X-Powered-By",
		"Alt-Svc",
		"Anthropic-Organization-Id",
		"Openai-Organization",
		"X-Upstream-Request-Id",
	}
	for _, name := range blocked {
		assert.False(t, ShouldCopyUpstreamHeader(nil, name, []string{"v"}), name)
	}
}

func TestShouldCopyUpstreamHeaderCapturesUpstreamRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	assert.False(t, ShouldCopyUpstreamHeader(c, common.RequestIdKey, []string{"upstream-id-1"}))
	assert.Equal(t, "upstream-id-1", c.GetString(common.UpstreamRequestIdKey))
}

func TestIOCopyBytesGracefullyDropsUpstreamIdentityHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	upstream := &http.Response{StatusCode: http.StatusOK, Header: http.Header{}}
	upstream.Header.Set("Content-Type", "application/json")
	upstream.Header.Set("X-Ratelimit-Remaining-Tokens", "99")
	upstream.Header.Set("X-Request-Id", "req_upstream")
	upstream.Header.Set("X-Client-Request-Id", "client_upstream")
	upstream.Header.Set("Access-Control-Expose-Headers", "X-Request-ID, X-Client-Request-ID, X-Reasoning-Included")
	upstream.Header.Set("Via", "1.1 Caddy")
	upstream.Header.Set("Strict-Transport-Security", "max-age=31536000")
	upstream.Header.Set("X-Frame-Options", "DENY")
	upstream.Header.Set("Referrer-Policy", "no-referrer")
	upstream.Header.Set("Vary", "Origin")
	upstream.Header.Set("Server", "cloudflare")
	upstream.Header.Set("Cf-Ray", "abc-SIN")
	upstream.Header.Set("Set-Cookie", "a=b")
	upstream.Header.Set(common.RequestIdKey, "oneapi-upstream")

	IOCopyBytesGracefully(c, upstream, []byte(`{"ok":true}`))

	h := w.Result().Header
	require.Equal(t, "application/json", h.Get("Content-Type"))
	assert.Equal(t, "99", h.Get("X-Ratelimit-Remaining-Tokens"))
	assert.Equal(t, "11", h.Get("Content-Length"))
	for _, name := range []string{"X-Request-Id", "X-Client-Request-Id", "Access-Control-Expose-Headers", "Via",
		"Strict-Transport-Security", "X-Frame-Options", "Referrer-Policy", "Vary", "Server", "Cf-Ray", "Set-Cookie", common.RequestIdKey} {
		assert.Empty(t, h.Values(name), name)
	}
	assert.Equal(t, "oneapi-upstream", c.GetString(common.UpstreamRequestIdKey))
	assert.Equal(t, `{"ok":true}`, w.Body.String())
}
