package controller

import (
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// seedLegacyEditToken is the row an editor opens: quota 1000, model limits
// on, no IP restriction.
func seedLegacyEditToken(t *testing.T, key string) *model.Token {
	t.Helper()
	setupTokenUpdateCASTest(t)
	token := seedToken(t, model.DB, 1, "before", key)
	require.NoError(t, model.DB.Model(token).Updates(map[string]any{
		"remain_quota": 1000, "unlimited_quota": false,
		"model_limits_enabled": true, "model_limits": "gpt-a", "allow_ips": "",
	}).Error)
	stored := reloadToken(t, token.Id)
	return &stored
}

// changeTokenRow writes the row as another window or a spend would, leaving
// the caller's snapshot of the opened form untouched.
func changeTokenRow(id int, columns map[string]any) error {
	return model.DB.Model(&model.Token{}).Where("id = ?", id).Updates(columns).Error
}

// legacyFullEdit is the body the legacy full editor sends: every field as the
// form holds it, plus what the form opened with.
func legacyFullEdit(token *model.Token, change map[string]any) map[string]any {
	body := map[string]any{
		"id": token.Id, "name": token.Name, "expired_time": token.ExpiredTime,
		"remain_quota": token.RemainQuota, "unlimited_quota": token.UnlimitedQuota,
		"expected_remain_quota": token.RemainQuota, "expected_unlimited_quota": token.UnlimitedQuota,
		"model_limits_enabled": token.ModelLimitsEnabled, "model_limits": token.ModelLimits,
		"allow_ips": token.AllowIps, "group": token.Group, "cross_group_retry": token.CrossGroupRetry,
		"allow_user_quota_query": token.AllowUserQuotaQuery,
		"expected_original": map[string]any{
			"name": token.Name, "expired_time": token.ExpiredTime,
			"model_limits_enabled": token.ModelLimitsEnabled, "model_limits": token.ModelLimits,
			"allow_ips": token.AllowIps, "group": token.Group, "cross_group_retry": token.CrossGroupRetry,
			"allow_user_quota_query": token.AllowUserQuotaQuery,
		},
	}
	for k, v := range change {
		body[k] = v
	}
	return body
}

// Window 1: another window added an IP restriction after this form opened.
// A rename from the stale form keeps the new restriction.
func TestUpdateTokenOriginalRenameKeepsRestrictionAddedMeanwhile(t *testing.T) {
	opened := seedLegacyEditToken(t, "origrenamekeepsips1")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{
		"allow_ips": "203.0.113.7", "model_limits": "gpt-a,gpt-b",
	}))

	response, _ := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{"name": "after"}))
	require.True(t, response.Success, response.Message)

	stored := reloadToken(t, opened.Id)
	assert.Equal(t, "after", stored.Name)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "203.0.113.7", *stored.AllowIps)
	assert.Equal(t, "gpt-a,gpt-b", stored.ModelLimits)
	assert.Equal(t, 1000, stored.RemainQuota)
}

// Window 1: this form changes model_limits, but another window already
// changed them. The write is refused and nothing (not even the name) lands.
func TestUpdateTokenOriginalChangedFieldConflicts(t *testing.T) {
	opened := seedLegacyEditToken(t, "origlimitsconflict1")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"model_limits": "gpt-z"}))

	_, extra := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{
		"name": "after", "model_limits": "gpt-c",
	}))
	assert.False(t, extra.Success)
	assert.Equal(t, "token_conflict", extra.Code)
	assert.NotEmpty(t, extra.Message)

	stored := reloadToken(t, opened.Id)
	assert.Equal(t, "before", stored.Name)
	assert.Equal(t, "gpt-z", stored.ModelLimits)
}

// Window 1: the other window already set the same value this form submits.
// It differs from what the form opened with, so it is still a conflict.
func TestUpdateTokenOriginalSameValueSetMeanwhileConflicts(t *testing.T) {
	opened := seedLegacyEditToken(t, "origsamevalue12345")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"allow_ips": "203.0.113.9"}))

	_, extra := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{"allow_ips": "203.0.113.9"}))
	assert.Equal(t, "token_conflict", extra.Code)
}

// A changed field whose original still holds is written.
func TestUpdateTokenOriginalChangeApplies(t *testing.T) {
	opened := seedLegacyEditToken(t, "origchangeapplies1")
	response, _ := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{
		"allow_ips": "198.51.100.4", "model_limits_enabled": false,
	}))
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, opened.Id)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "198.51.100.4", *stored.AllowIps)
	assert.False(t, stored.ModelLimitsEnabled)
}

// expected_original.allow_ips = null matches a NULL column.
func TestUpdateTokenOriginalNullAllowIps(t *testing.T) {
	opened := seedLegacyEditToken(t, "orignullallowips12")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"allow_ips": nil}))
	reopened := reloadToken(t, opened.Id)
	opened = &reopened
	require.Nil(t, opened.AllowIps)

	response, _ := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{"allow_ips": "203.0.113.3"}))
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, opened.Id)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "203.0.113.3", *stored.AllowIps)
}

// Window 2: the row changes after the handler read it but before its
// UPDATE. The column condition makes the UPDATE hit 0 rows, and the
// handler answers token_conflict without writing anything.
func TestUpdateTokenOriginalChangeBetweenReadAndWriteConflicts(t *testing.T) {
	opened := seedLegacyEditToken(t, "origreadwriterace1")
	var fired atomic.Bool
	const callback = "token-original:race"
	require.NoError(t, model.DB.Callback().Query().After("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "tokens" && fired.CompareAndSwap(false, true) {
			require.NoError(t, model.DB.Session(&gorm.Session{NewDB: true}).Exec(
				"UPDATE tokens SET allow_ips = ? WHERE id = ?", "203.0.113.50", opened.Id).Error)
		}
	}))
	t.Cleanup(func() { require.NoError(t, model.DB.Callback().Query().Remove(callback)) })

	_, extra := putTokenForTest(t, "/api/token/", 1, legacyFullEdit(opened, map[string]any{
		"name": "after", "allow_ips": "198.51.100.1",
	}))
	require.True(t, fired.Load())
	assert.Equal(t, "token_conflict", extra.Code)
	stored := reloadToken(t, opened.Id)
	assert.Equal(t, "before", stored.Name)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "203.0.113.50", *stored.AllowIps)
}

// Window 2 at the model layer: the configuration conditions and the quota
// condition share one UPDATE, so either mismatch writes nothing.
func TestUpdateTokenColumnsConfigAndQuotaAtomic(t *testing.T) {
	opened := seedLegacyEditToken(t, "origatomicquota123")
	empty := ""
	affected, err := model.UpdateTokenColumns(opened.Id, 1, opened.Key,
		map[string]any{"allow_ips": "198.51.100.1", "remain_quota": 5000},
		&model.TokenColumnExpectation{
			AllowIps: &model.TokenAllowIpsExpectation{Value: &empty},
			Quota:    &model.TokenQuotaExpectation{RemainQuota: 999, UnlimitedQuota: false},
		})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)
	stored := reloadToken(t, opened.Id)
	assert.Equal(t, 1000, stored.RemainQuota)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "", *stored.AllowIps)
}

// Without expected_original the restriction fields behave as before: the
// body's value is written.
func TestUpdateTokenWithoutOriginalKeepsLegacyBehaviour(t *testing.T) {
	opened := seedLegacyEditToken(t, "orignooriginal1234")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"allow_ips": "203.0.113.7"}))
	body := legacyFullEdit(opened, map[string]any{"name": "after"})
	delete(body, "expected_original")

	response, _ := putTokenForTest(t, "/api/token/", 1, body)
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, opened.Id)
	assert.Equal(t, "after", stored.Name)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "", *stored.AllowIps)
}

// A key missing from expected_original falls back to the old handling for
// that field only.
func TestUpdateTokenOriginalMissingKeyFallsBack(t *testing.T) {
	opened := seedLegacyEditToken(t, "origmissingkey1234")
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"allow_ips": "203.0.113.7", "model_limits": "gpt-z"}))
	body := legacyFullEdit(opened, nil)
	original := body["expected_original"].(map[string]any)
	delete(original, "model_limits")

	response, _ := putTokenForTest(t, "/api/token/", 1, body)
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, opened.Id)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, "203.0.113.7", *stored.AllowIps, "reported field kept")
	assert.Equal(t, "gpt-a", stored.ModelLimits, "unreported field written as before")
}

// Without expected quota fields a changed quota is refused outright and
// nothing is written; an unchanged quota is accepted and left as the row
// holds it, even when a spend landed while the form was open.
func TestUpdateTokenFullPutWithoutExpectedQuota(t *testing.T) {
	opened := seedLegacyEditToken(t, "orignoexpectquota1")

	body := legacyFullEdit(opened, map[string]any{"name": "after", "remain_quota": 5000})
	delete(body, "expected_remain_quota")
	_, extra := putTokenForTest(t, "/api/token/", 1, body)
	assert.False(t, extra.Success)
	assert.Equal(t, "token_quota_expected_required", extra.Code)
	assert.NotEmpty(t, extra.Message)
	stored := reloadToken(t, opened.Id)
	assert.Equal(t, "before", stored.Name)
	assert.Equal(t, 1000, stored.RemainQuota)

	// Spend after the form opened; the form still shows 1000.
	require.NoError(t, changeTokenRow(opened.Id, map[string]any{"remain_quota": 700}))
	body = legacyFullEdit(opened, map[string]any{"name": "after"})
	delete(body, "expected_remain_quota")
	delete(body, "expected_unlimited_quota")
	_, extra = putTokenForTest(t, "/api/token/", 1, body)
	assert.Equal(t, "token_quota_expected_required", extra.Code,
		"1000 is not the current 700, so the submitted quota differs")

	reopened := reloadToken(t, opened.Id)
	opened = &reopened
	body = legacyFullEdit(opened, map[string]any{"name": "after"})
	delete(body, "expected_remain_quota")
	delete(body, "expected_unlimited_quota")
	response, _ := putTokenForTest(t, "/api/token/", 1, body)
	require.True(t, response.Success, response.Message)
	stored = reloadToken(t, opened.Id)
	assert.Equal(t, "after", stored.Name)
	assert.Equal(t, 700, stored.RemainQuota)
}
