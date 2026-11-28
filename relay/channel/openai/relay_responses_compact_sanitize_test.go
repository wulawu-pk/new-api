package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// TestOaiResponsesCompactionHandlerForwardsOnlyPublicUsage covers the compaction
// endpoint, which writes its own response body: its usage must go through the
// same allow-list as the other Responses exits, or the upstream attribution
// object (its item ids and per-message token split) reaches the client here.
func TestOaiResponsesCompactionHandlerForwardsOnlyPublicUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	body := `{"id":"resp_compact","object":"response.compaction","created_at":1764300000,` +
		`"instructions":"private","output":[{"type":"compaction","encrypted_content":"abc\u0041","phase":"final"}],"usage":` + upstreamAttributionUsage + `}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses/compact", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}

	usage, apiErr := OaiResponsesCompactionHandler(c, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)

	sent := w.Body.Bytes()
	require.True(t, gjson.ValidBytes(sent), "the client must still receive valid JSON")

	assert.False(t, gjson.GetBytes(sent, "usage.attribution").Exists(),
		"upstream attribution must not reach the client")
	assert.NotContains(t, string(sent), "msg_upstreamprivate")
	assert.NotContains(t, string(sent), "rs_upstreamprivate")
	assert.Equal(t, publicAttributionUsage, gjson.GetBytes(sent, "usage").Raw,
		"usage keeps exactly the public fields and the upstream numbers")

	for _, path := range []string{"instructions", "output.0.phase"} {
		require.False(t, gjson.GetBytes(sent, path).Exists(), path)
	}
	for _, path := range []string{"id", "object", "created_at", "output.0.encrypted_content"} {
		require.Equal(t, gjson.Get(body, path).Raw, gjson.GetBytes(sent, path).Raw, path)
	}
	assert.Equal(t, "resp_compact", gjson.GetBytes(sent, "id").String())
	assert.Equal(t, "response.compaction", gjson.GetBytes(sent, "object").String())
	assert.Equal(t, int64(1764300000), gjson.GetBytes(sent, "created_at").Int())

	// Billing still reads the upstream usage.
	assert.Equal(t, 5373, usage.PromptTokens)
	assert.Equal(t, 5, usage.CompletionTokens)
	assert.Equal(t, 5248, usage.PromptTokensDetails.CachedTokens)

	// dto import is exercised through the usage assertions above; keep the
	// compile-time check explicit so an unused import cannot creep in.
	var _ *dto.Usage = usage
	var _ *types.NewAPIError = apiErr
}
