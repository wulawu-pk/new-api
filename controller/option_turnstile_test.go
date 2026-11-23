package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTurnstileOptionTest(t *testing.T, enabled bool, siteKey, secretKey string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	// In-memory SQLite: a file database stays locked on Windows and breaks
	// TempDir cleanup.
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.User{}, &model.Log{}, &model.AuditLog{}))

	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousMaster := common.RedisEnabled, common.IsMasterNode
	previousEnabled, previousSite, previousSecret := common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled, common.IsMasterNode = previousRedis, previousMaster
		common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = previousEnabled, previousSite, previousSecret
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		_ = sqlDB.Close()
	})
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled, common.IsMasterNode = false, false
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitLogDB())
	common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = enabled, siteKey, secretKey
}

func putTurnstileOption(t *testing.T, body string) bool {
	t.Helper()
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodPut, "/api/option/", strings.NewReader(body))
	UpdateOption(c)
	require.Equal(t, http.StatusOK, response.Code)
	var payload struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload), response.Body.String())
	return payload.Success
}

func TestTurnstileEnableRequiresBothKeys(t *testing.T) {
	for _, tc := range []struct {
		name, site, secret string
		wantOK             bool
	}{
		{name: "missing secret key", site: "site-key", secret: "", wantOK: false},
		{name: "blank secret key", site: "site-key", secret: "   ", wantOK: false},
		{name: "missing site key", site: "", secret: "secret-key", wantOK: false},
		{name: "both keys set", site: "site-key", secret: "secret-key", wantOK: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setupTurnstileOptionTest(t, false, tc.site, tc.secret)
			ok := putTurnstileOption(t, `{"key":"TurnstileCheckEnabled","value":true}`)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.wantOK, common.TurnstileCheckEnabled)
		})
	}
}

func TestTurnstileKeysCannotBeClearedWhileEnabled(t *testing.T) {
	for _, key := range []string{"TurnstileSiteKey", "TurnstileSecretKey"} {
		for _, value := range []string{"", "  "} {
			t.Run(key+"/"+strings.ReplaceAll(value, " ", "_"), func(t *testing.T) {
				setupTurnstileOptionTest(t, true, "site-key", "secret-key")
				ok := putTurnstileOption(t, `{"key":"`+key+`","value":"`+value+`"}`)
				assert.False(t, ok)
				assert.Equal(t, "site-key", common.TurnstileSiteKey)
				assert.Equal(t, "secret-key", common.TurnstileSecretKey)
			})
		}
	}
}

func TestTurnstileKeyRotationWhileEnabled(t *testing.T) {
	setupTurnstileOptionTest(t, true, "site-key", "secret-key")
	assert.True(t, putTurnstileOption(t, `{"key":"TurnstileSiteKey","value":"new-site-key"}`))
	assert.True(t, putTurnstileOption(t, `{"key":"TurnstileSecretKey","value":"new-secret-key"}`))
	assert.Equal(t, "new-site-key", common.TurnstileSiteKey)
	assert.Equal(t, "new-secret-key", common.TurnstileSecretKey)
	assert.True(t, common.TurnstileCheckEnabled)
}

func TestTurnstileKeysCanBeClearedWhileDisabled(t *testing.T) {
	setupTurnstileOptionTest(t, false, "site-key", "secret-key")
	assert.True(t, putTurnstileOption(t, `{"key":"TurnstileSecretKey","value":""}`))
	assert.Equal(t, "", common.TurnstileSecretKey)
	assert.True(t, putTurnstileOption(t, `{"key":"TurnstileCheckEnabled","value":false}`))
}
