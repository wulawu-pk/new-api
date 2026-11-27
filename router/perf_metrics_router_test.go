package router

import (
	"maps"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPerfMetricsRoutePermissions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { assert.NoError(t, sqlDB.Close()) })

	previousDB, previousLogDB := model.DB, model.LOG_DB
	mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
	redisEnabled, sessionSecret := common.RedisEnabled, common.SessionSecret
	rateLimitEnabled := common.GlobalApiRateLimitEnable
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(mainType, logType)
		common.RedisEnabled, common.SessionSecret = redisEnabled, sessionSecret
		common.GlobalApiRateLimitEnable = rateLimitEnabled
	})
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.SessionSecret = "perf-metrics-router-test"
	common.GlobalApiRateLimitEnable = false
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, i18n.Init())
	require.NoError(t, model.InitLogDB())
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuditLog{}, &model.UserAccessToken{}, &model.Option{}, &model.PerfMetric{}))

	engine := gin.New()
	SetApiRouter(engine)
	login := func(name string, role int) string {
		t.Helper()
		user := model.User{
			Username: name, AffCode: name, Role: role,
			Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
		}
		require.NoError(t, db.Create(&user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "perf-metrics-test")
		require.NoError(t, err)
		return bundle.AccessToken
	}
	user := login("user", common.RoleCommonUser)
	admin := login("admin", common.RoleAdminUser)
	for _, tc := range []struct {
		name, path, token string
		status            int
	}{
		{"groups/anonymous", "/api/perf-metrics/groups", "", http.StatusOK},
		{"groups/user", "/api/perf-metrics/groups", user, http.StatusOK},
		{"groups/admin", "/api/perf-metrics/groups", admin, http.StatusOK},
		{"summary/anonymous", "/api/perf-metrics/summary", "", http.StatusUnauthorized},
		{"summary/user", "/api/perf-metrics/summary", user, http.StatusForbidden},
		{"summary/admin", "/api/perf-metrics/summary", admin, http.StatusOK},
		{"model/anonymous", "/api/perf-metrics?model=test-model", "", http.StatusUnauthorized},
		{"model/user", "/api/perf-metrics?model=test-model", user, http.StatusForbidden},
		{"model/admin", "/api/perf-metrics?model=test-model", admin, http.StatusOK},
		{"missing-model/admin", "/api/perf-metrics", admin, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertPerfMetricsResponse(t, engine, tc.path, tc.token, tc.status)
		})
	}

	t.Run("groups/anonymous-with-pricing-disabled", func(t *testing.T) {
		common.OptionMapRWMutex.Lock()
		previous := common.OptionMap
		common.OptionMap = make(map[string]string, len(previous)+1)
		maps.Copy(common.OptionMap, previous)
		common.OptionMap["HeaderNavModules"] = `{"pricing":{"enabled":false,"requireAuth":true}}`
		common.OptionMapRWMutex.Unlock()
		t.Cleanup(func() {
			common.OptionMapRWMutex.Lock()
			defer common.OptionMapRWMutex.Unlock()
			common.OptionMap = previous
		})
		assertPerfMetricsResponse(t, engine, "/api/perf-metrics/groups", "", http.StatusOK)
	})
}

func assertPerfMetricsResponse(t *testing.T, engine *gin.Engine, path, token string, status int) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	assert.Equal(t, status, response.Code, response.Body.String())
	if status == http.StatusOK {
		var body struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
		assert.True(t, body.Success, response.Body.String())
	}
}
