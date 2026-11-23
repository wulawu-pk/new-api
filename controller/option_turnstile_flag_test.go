package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// The admin form cannot read the Turnstile secret, so GetOptions reports
// whether one is saved, never the secret itself, and the flag is read-only.
func TestGetOptionsReportsTurnstileSecretConfigured(t *testing.T) {
	for _, tc := range []struct {
		secret string
		want   string
	}{{"0xSECRETVALUE", `"key":"TurnstileSecretKeyConfigured","value":"true"`}, {"  ", `"key":"TurnstileSecretKeyConfigured","value":"false"`}} {
		setupTurnstileOptionTest(t, false, "site", tc.secret)
		common.OptionMapRWMutex.Lock()
		common.OptionMap["TurnstileSecretKey"] = tc.secret
		common.OptionMap["TurnstileSiteKey"] = "site"
		common.OptionMapRWMutex.Unlock()

		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/option/", nil)
		GetOptions(c)

		body := response.Body.String()
		assert.Contains(t, body, tc.want)
		assert.NotContains(t, body, "0xSECRETVALUE")
		assert.NotContains(t, body, `"key":"TurnstileSecretKey",`)
	}
}

func TestTurnstileSecretConfiguredFlagIsReadOnly(t *testing.T) {
	setupTurnstileOptionTest(t, false, "", "")
	assert.False(t, putTurnstileOption(t, `{"key":"TurnstileSecretKeyConfigured","value":"true"}`))
}
