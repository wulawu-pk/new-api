package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedTokenForColumnExpectation(t *testing.T, key string, allowIps *string) *Token {
	t.Helper()
	truncateTables(t)
	token := &Token{
		UserId: 1, Name: "orig", Key: key, Status: common.TokenStatusEnabled,
		ExpiredTime: -1, RemainQuota: 100, Group: "default",
		ModelLimitsEnabled: true, ModelLimits: "gpt-a",
	}
	require.NoError(t, DB.Create(token).Error)
	// GORM's default:'' turns a nil pointer into ''; set NULL explicitly.
	require.NoError(t, DB.Model(token).Update("allow_ips", allowIps).Error)
	return token
}

// Each configuration condition is part of the one UPDATE: a mismatch on any
// of them writes nothing, quota included.
func TestUpdateTokenColumnsConfigConditions(t *testing.T) {
	ips := "203.0.113.1"
	token := seedTokenForColumnExpectation(t, "colexpect-config-1", &ips)

	stale := "198.51.100.9"
	affected, err := UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"allow_ips": "", "name": "renamed", "remain_quota": 5},
		&TokenColumnExpectation{AllowIps: &TokenAllowIpsExpectation{Value: &stale}})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)

	var stored Token
	require.NoError(t, DB.First(&stored, token.Id).Error)
	assert.Equal(t, "orig", stored.Name)
	assert.Equal(t, 100, stored.RemainQuota)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, ips, *stored.AllowIps)

	staleLimits := "gpt-b"
	group := "default"
	affected, err = UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"model_limits": "gpt-c"},
		&TokenColumnExpectation{Group: &group, ModelLimits: &staleLimits})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)

	limits := "gpt-a"
	enabled := true
	affected, err = UpdateTokenColumns(token.Id, 1, token.Key,
		map[string]any{"model_limits": "gpt-c", "allow_ips": ""},
		&TokenColumnExpectation{Group: &group, ModelLimits: &limits, ModelLimitsEnabled: &enabled,
			AllowIps: &TokenAllowIpsExpectation{Value: &ips}})
	require.NoError(t, err)
	assert.EqualValues(t, 1, affected)
	require.NoError(t, DB.First(&stored, token.Id).Error)
	assert.Equal(t, "gpt-c", stored.ModelLimits)
}

func TestUpdateTokenColumnsAllowIpsNullCondition(t *testing.T) {
	token := seedTokenForColumnExpectation(t, "colexpect-null-1", nil)

	empty := ""
	affected, err := UpdateTokenColumns(token.Id, 1, token.Key, map[string]any{"allow_ips": "203.0.113.5"},
		&TokenColumnExpectation{AllowIps: &TokenAllowIpsExpectation{Value: &empty}})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected, "'' does not match NULL")

	affected, err = UpdateTokenColumns(token.Id, 1, token.Key, map[string]any{"allow_ips": "203.0.113.5"},
		&TokenColumnExpectation{AllowIps: &TokenAllowIpsExpectation{}})
	require.NoError(t, err)
	assert.EqualValues(t, 1, affected, "IS NULL matches")
}

func TestTokenColumnExpectationMatchesConfig(t *testing.T) {
	ips := "203.0.113.1"
	name, limits, group := "orig", "gpt-a", "default"
	expired := int64(-1)
	yes, no := true, false
	token := &Token{Name: name, ExpiredTime: expired, ModelLimitsEnabled: true, ModelLimits: limits,
		AllowIps: &ips, Group: group, CrossGroupRetry: false, AllowUserQuotaQuery: true}

	full := &TokenColumnExpectation{Name: &name, ExpiredTime: &expired, ModelLimitsEnabled: &yes,
		ModelLimits: &limits, AllowIps: &TokenAllowIpsExpectation{Value: &ips}, Group: &group,
		CrossGroupRetry: &no, AllowUserQuotaQuery: &yes}
	assert.True(t, full.Matches(token))

	for label, mismatch := range map[string]*TokenColumnExpectation{
		"name":       {Name: common.GetPointer("other")},
		"expired":    {ExpiredTime: common.GetPointer(int64(5))},
		"enabled":    {ModelLimitsEnabled: &no},
		"limits":     {ModelLimits: common.GetPointer("gpt-b")},
		"ips null":   {AllowIps: &TokenAllowIpsExpectation{}},
		"ips other":  {AllowIps: &TokenAllowIpsExpectation{Value: common.GetPointer("x")}},
		"group":      {Group: common.GetPointer("vip")},
		"retry":      {CrossGroupRetry: &yes},
		"user quota": {AllowUserQuotaQuery: &no},
	} {
		assert.False(t, mismatch.Matches(token), label)
	}
	token.AllowIps = nil
	assert.True(t, (&TokenColumnExpectation{AllowIps: &TokenAllowIpsExpectation{}}).Matches(token))
}
