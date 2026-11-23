package controller

import (
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func putTokenForTest(t *testing.T, target string, userID int, body any) (tokenAPIResponse, tokenPatchAPIResponse) {
	t.Helper()
	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, target, body, userID)
	UpdateToken(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	var extra tokenPatchAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &extra))
	return decodeAPIResponse(t, recorder), extra
}

func setupTokenUpdateCASTest(t *testing.T) {
	t.Helper()
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, i18n.Init())
	setupTokenControllerTestDB(t)
	require.NoError(t, model.InitLogDB())
}

func TestUpdateTokenStatusOnlyWritesStatusAlone(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "toggle", "casstatusonly12345")
	ips := "203.0.113.9"
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{
		"remain_quota": 777, "unlimited_quota": false, "model_limits_enabled": true,
		"model_limits": "gpt-a", "allow_ips": ips,
	}).Error)

	// The client carries stale values; only status may be written.
	response, _ := putTokenForTest(t, "/api/token/?status_only=true", 1, map[string]any{
		"id": token.Id, "status": common.TokenStatusDisabled, "name": "stale",
		"remain_quota": 5, "unlimited_quota": true, "model_limits_enabled": false, "group": "vip",
	})
	require.True(t, response.Success, response.Message)

	stored := reloadToken(t, token.Id)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	assert.Equal(t, "toggle", stored.Name)
	assert.Equal(t, 777, stored.RemainQuota)
	assert.False(t, stored.UnlimitedQuota)
	assert.True(t, stored.ModelLimitsEnabled)
	assert.Equal(t, "gpt-a", stored.ModelLimits)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, ips, *stored.AllowIps)
	assert.Equal(t, "default", stored.Group)

	response, _ = putTokenForTest(t, "/api/token/?status_only=true", 1, map[string]any{
		"id": token.Id, "status": common.TokenStatusEnabled,
	})
	require.True(t, response.Success, response.Message)
	stored = reloadToken(t, token.Id)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status)
	assert.Equal(t, 777, stored.RemainQuota)
}

func TestUpdateTokenStatusOnlyKeepsEnableValidation(t *testing.T) {
	setupTokenUpdateCASTest(t)
	exhausted := seedToken(t, model.DB, 1, "exhausted", "casexhausted123456")
	require.NoError(t, model.DB.Model(exhausted).Updates(map[string]any{
		"status": common.TokenStatusExhausted, "remain_quota": 0, "unlimited_quota": false,
	}).Error)
	response, _ := putTokenForTest(t, "/api/token/?status_only=true", 1, map[string]any{
		"id": exhausted.Id, "status": common.TokenStatusEnabled, "remain_quota": 100,
	})
	assert.False(t, response.Success)
	assert.Equal(t, common.TokenStatusExhausted, reloadToken(t, exhausted.Id).Status)

	expired := seedToken(t, model.DB, 1, "expired", "casexpired12345678")
	require.NoError(t, model.DB.Model(expired).Updates(map[string]any{
		"status": common.TokenStatusExpired, "expired_time": time.Now().Add(-time.Hour).Unix(),
	}).Error)
	response, _ = putTokenForTest(t, "/api/token/?status_only=true", 1, map[string]any{
		"id": expired.Id, "status": common.TokenStatusEnabled, "expired_time": -1,
	})
	assert.False(t, response.Success)
	assert.Equal(t, common.TokenStatusExpired, reloadToken(t, expired.Id).Status)
}

func TestUpdateTokenStatusConditionalOnPreviousStatus(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "race", "casstatusrace12345")
	// Another toggle already disabled the token after this writer read it
	// as exhausted; the auto-recovery must not re-enable it.
	require.NoError(t, model.DB.Model(token).Update("status", common.TokenStatusDisabled).Error)
	readStatus := common.TokenStatusExhausted
	affected, err := model.UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"status": common.TokenStatusEnabled, "remain_quota": 50},
		&model.TokenColumnExpectation{Status: &readStatus})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	assert.Equal(t, 100, stored.RemainQuota)

	readStatus = common.TokenStatusDisabled
	affected, err = model.UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"status": common.TokenStatusEnabled},
		&model.TokenColumnExpectation{Status: &readStatus,
			Quota: &model.TokenQuotaExpectation{RemainQuota: 100, UnlimitedQuota: true}})
	require.NoError(t, err)
	assert.EqualValues(t, 1, affected)
	assert.Equal(t, common.TokenStatusEnabled, reloadToken(t, token.Id).Status)
}

func TestUpdateTokenFullStaleQuotaConflicts(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "legacy", "caslegacystale1234")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 300, "unlimited_quota": false}).Error)

	// Simulate a spend landing between the handler's read and its write:
	// the expectation is the read value, the row now holds another one.
	affected, err := model.UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"remain_quota": 1000, "name": "renamed"},
		&model.TokenColumnExpectation{Quota: &model.TokenQuotaExpectation{RemainQuota: 320, UnlimitedQuota: false}})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "legacy", stored.Name)
	assert.Equal(t, 300, stored.RemainQuota)

	// Through the handler, a body whose quota differs from the row is
	// written conditionally and succeeds when nothing changed in between.
	response, _ := putTokenForTest(t, "/api/token/", 1, map[string]any{
		"id": token.Id, "name": "legacy", "expired_time": -1, "remain_quota": 1000,
		"unlimited_quota": false, "group": "default",
	})
	require.True(t, response.Success, response.Message)
	assert.Equal(t, 1000, reloadToken(t, token.Id).RemainQuota)
}

func TestApplyTokenColumnsConflictResponse(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "legacy", "casapplyconflict12")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 300, "unlimited_quota": false}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", nil, 1)
	ok := applyTokenColumns(ctx, token, 1, map[string]any{"remain_quota": 1000, "name": "renamed"},
		&model.TokenColumnExpectation{Quota: &model.TokenQuotaExpectation{RemainQuota: 320, UnlimitedQuota: false}})
	assert.False(t, ok)
	var extra tokenPatchAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &extra))
	assert.False(t, extra.Success)
	assert.Equal(t, "token_conflict", extra.Code)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "legacy", stored.Name)
	assert.Equal(t, 300, stored.RemainQuota)
}

func TestUpdateTokenFullRenameKeepsQuota(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "before", "caslegacyrename123")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{
		"remain_quota": 420, "unlimited_quota": false, "model_limits_enabled": true, "model_limits": "gpt-a",
	}).Error)

	response, _ := putTokenForTest(t, "/api/token/", 1, map[string]any{
		"id": token.Id, "name": "after", "expired_time": -1, "remain_quota": 420,
		"unlimited_quota": false, "model_limits_enabled": false, "model_limits": "",
		"allow_ips": "198.51.100.1", "allow_user_quota_query": false, "group": "default",
	})
	require.True(t, response.Success, response.Message)

	var detail tokenResponseItem
	require.NoError(t, common.Unmarshal(response.Data, &detail))
	assert.Equal(t, "after", detail.Name)

	stored := reloadToken(t, token.Id)
	assert.Equal(t, "after", stored.Name)
	assert.Equal(t, 420, stored.RemainQuota)
	assert.False(t, stored.UnlimitedQuota)
	// Zero values sent through PUT are still written.
	assert.False(t, stored.ModelLimitsEnabled)
	assert.Equal(t, "", stored.ModelLimits)
	assert.False(t, stored.AllowUserQuotaQuery)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "198.51.100.1", *stored.AllowIps)
}

func TestPatchTokenAutoRecoveryRespectsConcurrentDisable(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "exhausted", "caspatchrecover123")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{
		"status": common.TokenStatusExhausted, "remain_quota": 0, "unlimited_quota": false,
	}).Error)
	// PATCH recovery decided from status=exhausted; meanwhile the user
	// disabled it. The conditional write must not re-enable.
	require.NoError(t, model.DB.Model(token).Update("status", common.TokenStatusDisabled).Error)
	readStatus := common.TokenStatusExhausted
	ctx, recorder := newAuthenticatedContext(t, http.MethodPatch, "/api/token/1", nil, 1)
	ok := applyTokenColumns(ctx, token, 1,
		map[string]any{"status": common.TokenStatusEnabled, "remain_quota": 50},
		&model.TokenColumnExpectation{Status: &readStatus,
			Quota: &model.TokenQuotaExpectation{RemainQuota: 0, UnlimitedQuota: false}})
	assert.False(t, ok)
	var extra tokenPatchAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &extra))
	assert.Equal(t, "token_conflict", extra.Code)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	assert.Equal(t, 0, stored.RemainQuota)
}

// A rename from an editor that opened the token before a spend keeps the
// spend: the editor reports the quota it saw and did not change it.
func TestUpdateTokenFullPutKeepsSpendMadeWhileEditorWasOpen(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "before", "casspendwhileopen1")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 1000, "unlimited_quota": false}).Error)
	// spend after the editor opened (it saw 1000)
	require.NoError(t, model.DB.Model(token).Update("remain_quota", 600).Error)

	response, _ := putTokenForTest(t, "/api/token/", 1, map[string]any{
		"id": token.Id, "name": "after", "group": "default", "expired_time": -1,
		"remain_quota": 1000, "unlimited_quota": false,
		"expected_remain_quota": 1000, "expected_unlimited_quota": false,
	})
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "after", stored.Name)
	assert.Equal(t, 600, stored.RemainQuota)
}

// An editor that changed the quota after a spend it did not see is refused.
func TestUpdateTokenFullPutQuotaChangeAfterUnseenSpendConflicts(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "before", "casspendconflict12")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 1000, "unlimited_quota": false}).Error)
	require.NoError(t, model.DB.Model(token).Update("remain_quota", 600).Error)

	_, extra := putTokenForTest(t, "/api/token/", 1, map[string]any{
		"id": token.Id, "name": "after", "group": "default", "expired_time": -1,
		"remain_quota": 5000, "unlimited_quota": false,
		"expected_remain_quota": 1000, "expected_unlimited_quota": false,
	})
	assert.False(t, extra.Success)
	assert.Equal(t, "token_conflict", extra.Code)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "before", stored.Name)
	assert.Equal(t, 600, stored.RemainQuota)
}

// With the quota the editor saw still in place, a quota change applies.
func TestUpdateTokenFullPutQuotaChangeWithFreshExpectationApplies(t *testing.T) {
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "before", "casfreshquota12345")
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{"remain_quota": 1000, "unlimited_quota": false}).Error)

	response, _ := putTokenForTest(t, "/api/token/", 1, map[string]any{
		"id": token.Id, "name": "before", "group": "default", "expired_time": -1,
		"remain_quota": 5000, "unlimited_quota": false,
		"expected_remain_quota": 1000, "expected_unlimited_quota": false,
	})
	require.True(t, response.Success, response.Message)
	assert.Equal(t, 5000, reloadToken(t, token.Id).RemainQuota)
}
