package middleware

import (
	"fmt"
	"io"
	"maps"
	"net/http"
	"runtime/debug"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// panicResponseMessage is the client-facing text for a recovered panic, an
// English source key the web console translates (common.Message). It carries
// only the request ID, never the panic value.
const panicResponseMessage = "An internal error occurred. Please try again later or contact support with request ID {{request_id}}"

// panicRequestID returns the ID set by the RequestId middleware, falling back
// to the response header it writes.
func panicRequestID(c *gin.Context) string {
	if id := c.GetString(common.RequestIdKey); id != "" {
		return id
	}
	return c.Writer.Header().Get(common.RequestIdKey)
}

// logPanic writes the masked panic value to the server log only.
func logPanic(c *gin.Context, err any) {
	common.SysLog(common.LogText("panic detected: request_id=%s, error: %s", panicRequestID(c), common.MaskSensitiveInfo(fmt.Sprintf("%v", err))))
}

// writePanicResponse answers a recovered panic with a neutral 500 body: a
// fixed message and the request ID, never the panic text or stack.
func writePanicResponse(c *gin.Context) {
	message := common.NewMessage(panicResponseMessage, map[string]any{"request_id": panicRequestID(c)})
	body := gin.H{
		"error": gin.H{
			"message": message.Error(),
			"type":    "internal_error",
			"code":    "internal_error",
		},
	}
	maps.Copy(body, message.Fields())
	c.AbortWithStatusJSON(http.StatusInternalServerError, body)
}

// maskingLogWriter masks credentials in gin's recovery output (panic value,
// request headers in debug mode, stack) before it reaches the log file.
type maskingLogWriter struct {
	out io.Writer
}

func (w maskingLogWriter) Write(p []byte) (int, error) {
	if _, err := w.out.Write([]byte(common.MaskSensitiveInfo(string(p)))); err != nil {
		return 0, err
	}
	return len(p), nil
}

func RelayPanicRecover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				logPanic(c, err)
				common.SysLog(common.LogText("stacktrace from panic: %s", common.MaskSensitiveInfo(string(debug.Stack()))))
				writePanicResponse(c)
			}
		}()
		c.Next()
	}
}

// PanicRecover is the server-wide panic recovery. Gin logs the panic stack
// through common.ErrorLogWriter so it reaches the current log file.
func PanicRecover() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(maskingLogWriter{out: common.ErrorLogWriter}, func(c *gin.Context, err any) {
		logPanic(c, err)
		writePanicResponse(c)
	})
}
