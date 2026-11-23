package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPanicRecoverHidesPanicFromClient(t *testing.T) {
	previousMode, previousWriter, previousErrorWriter := gin.Mode(), gin.DefaultWriter, gin.DefaultErrorWriter
	gin.SetMode(gin.TestMode)
	var serverLog bytes.Buffer
	gin.DefaultWriter, gin.DefaultErrorWriter = &serverLog, &serverLog
	t.Cleanup(func() {
		gin.SetMode(previousMode)
		gin.DefaultWriter, gin.DefaultErrorWriter = previousWriter, previousErrorWriter
	})

	for name, recovery := range map[string]gin.HandlerFunc{
		"PanicRecover":      PanicRecover(),
		"RelayPanicRecover": RelayPanicRecover(),
	} {
		t.Run(name, func(t *testing.T) {
			serverLog.Reset()
			router := gin.New()
			router.Use(PanicRecover())
			router.Use(RequestId())
			router.Use(recovery)
			router.GET("/panic", func(c *gin.Context) {
				panic("secret sk-xxxx details api_key:hidden-value")
			})

			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/panic", nil))

			require.Equal(t, http.StatusInternalServerError, response.Code)
			requestID := response.Header().Get(common.RequestIdKey)
			require.NotEmpty(t, requestID)

			body := response.Body.String()
			lower := strings.ToLower(body)
			for _, leaked := range []string{"secret", "sk-", "github", "panic", "details", "hidden-value"} {
				assert.NotContains(t, lower, leaked)
			}
			assert.Contains(t, body, requestID)

			var payload struct {
				Error struct {
					Message string `json:"message"`
					Type    string `json:"type"`
					Code    string `json:"code"`
				} `json:"error"`
				MessageKey    string         `json:"message_key"`
				MessageParams map[string]any `json:"message_params"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
			assert.Equal(t, "internal_error", payload.Error.Type)
			assert.Equal(t, "internal_error", payload.Error.Code)
			assert.Contains(t, payload.Error.Message, requestID)
			assert.Equal(t, panicResponseMessage, payload.MessageKey)
			assert.Equal(t, requestID, payload.MessageParams["request_id"])

			// The panic is kept for the operator, masked, in the server log.
			logged := serverLog.String()
			assert.Contains(t, logged, "secret sk-xxxx details")
			assert.Contains(t, logged, requestID)
			assert.NotContains(t, logged, "hidden-value")
		})
	}
}
