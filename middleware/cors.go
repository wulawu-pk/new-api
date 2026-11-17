package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS is for endpoints authenticated by an API key in the request headers
// (/v1, /dashboard/billing, /api/usage, /api/log). Any origin may call them,
// but the response never carries credentials: no cookie is echoed back, so a
// page on another site cannot reuse the visitor's dashboard session.
func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowCredentials = false
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	return cors.New(config)
}

// SessionCORS is for dashboard endpoints reached with the session cookie.
// Only the site's own origins may read the response, and credentials are
// allowed for exactly those, never for an arbitrary Origin.
var dashboardAllowedOrigins = []string{
	"https://peroai.cc",
	"https://www.peroai.cc",
	"https://api.peroai.cc",
	"http://localhost:3000",
	"http://localhost:5173",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:5173",
}

func SessionCORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowOrigins = dashboardAllowedOrigins
	config.AllowWildcard = false
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	return cors.New(config)
}

func Version() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-New-Api-Version", common.Version)
		c.Next()
	}
}
