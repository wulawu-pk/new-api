package service

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/gin-gonic/gin"
)

func CloseResponseBodyGracefully(httpResponse *http.Response) {
	if httpResponse == nil || httpResponse.Body == nil {
		return
	}
	err := httpResponse.Body.Close()
	if err != nil {
		common.SysError(common.LogText("failed to close response body: %s", err.Error()))
	}
}

// forwardedUpstreamHeaders lists the upstream response headers a client
// actually needs. Everything else (request ids, Via, Server, security
// policies, CORS, cookies, CDN headers) would identify the upstream, so the
// copy is an allow-list rather than a deny-list.
var forwardedUpstreamHeaders = map[string]struct{}{
	"content-type":         {},
	"content-disposition":  {},
	"cache-control":        {},
	"retry-after":          {},
	"retry-after-ms":       {},
	"openai-processing-ms": {},
	// Codex reads these on /v1/responses streams (see copyCodexSSEHeaders).
	"x-reasoning-included": {},
	"x-codex-turn-state":   {},
}

// forwardedUpstreamHeaderPrefixes lets the OpenAI and Anthropic rate-limit
// families through so clients can back off.
var forwardedUpstreamHeaderPrefixes = []string{
	"x-ratelimit-",
	"anthropic-ratelimit-",
}

func isForwardedUpstreamHeader(k string) bool {
	name := strings.ToLower(strings.TrimSpace(k))
	if _, ok := forwardedUpstreamHeaders[name]; ok {
		return true
	}
	for _, prefix := range forwardedUpstreamHeaderPrefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

// ShouldCopyUpstreamHeader checks whether a given upstream response header
// should be copied to the client response. Only the allow-listed headers in
// forwardedUpstreamHeaders / forwardedUpstreamHeaderPrefixes are copied;
// Content-Length is managed separately. When the upstream header is
// X-Oneapi-Request-Id, the value is captured into the Gin context for later
// logging and the local instance ID is preserved.
func ShouldCopyUpstreamHeader(c *gin.Context, k string, v []string) bool {
	if strings.EqualFold(k, common.RequestIdKey) {
		if c != nil && len(v) > 0 {
			c.Set(common.UpstreamRequestIdKey, v[0])
		}
		return false
	}
	return isForwardedUpstreamHeader(k)
}

func IOCopyBytesGracefully(c *gin.Context, src *http.Response, data []byte) {
	if c.Writer == nil {
		return
	}

	body := io.NopCloser(bytes.NewBuffer(data))

	// We shouldn't set the header before we parse the response body, because the parse part may fail.
	// And then we will have to send an error response, but in this case, the header has already been set.
	// So the httpClient will be confused by the response.
	// For example, Postman will report error, and we cannot check the response at all.
	if src != nil {
		for k, v := range src.Header {
			if !ShouldCopyUpstreamHeader(c, k, v) {
				continue
			}
			c.Writer.Header().Set(k, v[0])
		}
	}

	// set Content-Length header manually BEFORE calling WriteHeader
	c.Writer.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))

	// Write header with status code (this sends the headers)
	if src != nil {
		c.Writer.WriteHeader(src.StatusCode)
	} else {
		c.Writer.WriteHeader(http.StatusOK)
	}

	_, err := io.Copy(c.Writer, body)
	if err != nil {
		logger.LogError(c, common.LogText("failed to copy response body: %s", err.Error()))
	}
	c.Writer.Flush()
}
