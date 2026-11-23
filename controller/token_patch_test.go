package controller

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type tokenPatchAPIResponse struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func patchTokenForTest(t *testing.T, id int, userID int, body any) (tokenAPIResponse, tokenPatchAPIResponse, string) {
	t.Helper()
	ctx, recorder := newAuthenticatedContext(t, http.MethodPatch, fmt.Sprintf("/api/token/%d", id), body, userID)
	ctx.Params = append(ctx.Params, gin.Param{Key: "id", Value: fmt.Sprint(id)})
	PatchToken(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	var extra tokenPatchAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &extra))
	return decodeAPIResponse(t, recorder), extra, recorder.Body.String()
}

func reloadToken(t *testing.T, id int) model.Token {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.First(&token, "id = ?", id).Error)
	return token
}

func TestAddTokenReturnsIdAndNameWithoutKey(t *testing.T) {
	setupTokenControllerTestDB(t)
	body := map[string]any{"name": "fresh", "expired_time": -1, "unlimited_quota": true, "group": "default"}
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/", body, 1)
	AddToken(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var data map[string]any
	require.NoError(t, common.Unmarshal(response.Data, &data))
	assert.Len(t, data, 2)
	assert.Equal(t, "fresh", data["name"])

	var stored model.Token
	require.NoError(t, model.DB.First(&stored, "name = ?", "fresh").Error)
	assert.EqualValues(t, stored.Id, data["id"])
	assert.NotContains(t, recorder.Body.String(), stored.Key)
}

func TestPatchTokenRenameKeepsQuotaAndLimits(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "before", "patchrename1234567")
	ips := "203.0.113.7"
	require.NoError(t, db.Model(token).Updates(map[string]any{
		"remain_quota": 500, "unlimited_quota": false, "model_limits_enabled": true,
		"model_limits": "gpt-a,gpt-b", "allow_ips": ips,
	}).Error)
	// Spend that happens while the editor is open.
	require.NoError(t, db.Model(token).Update("remain_quota", 420).Error)

	response, _, raw := patchTokenForTest(t, token.Id, 1, map[string]any{"name": "after"})
	require.True(t, response.Success, response.Message)

	stored := reloadToken(t, token.Id)
	assert.Equal(t, "after", stored.Name)
	assert.Equal(t, 420, stored.RemainQuota)
	assert.False(t, stored.UnlimitedQuota)
	assert.True(t, stored.ModelLimitsEnabled)
	assert.Equal(t, "gpt-a,gpt-b", stored.ModelLimits)
	require.NotNil(t, stored.AllowIps)
	assert.Equal(t, ips, *stored.AllowIps)

	var detail tokenResponseItem
	require.NoError(t, common.Unmarshal(response.Data, &detail))
	assert.Equal(t, "after", detail.Name)
	assert.Equal(t, stored.GetMaskedKey(), detail.Key)
	assert.False(t, strings.Contains(raw, stored.Key))
}

func TestPatchTokenQuotaConflictWritesNothing(t *testing.T) {
	require.NoError(t, i18n.Init())
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "quota", "patchconflict12345")
	require.NoError(t, db.Model(token).Updates(map[string]any{"remain_quota": 300, "unlimited_quota": false}).Error)

	response, extra, _ := patchTokenForTest(t, token.Id, 1, map[string]any{
		"name": "renamed", "remain_quota": 1000,
		"expected_remain_quota": 500, "expected_unlimited_quota": false,
	})
	assert.False(t, response.Success)
	assert.Equal(t, "token_conflict", extra.Code)
	assert.NotEmpty(t, response.Message)
	assert.NotEqual(t, i18n.MsgTokenQuotaConflict, response.Message)

	stored := reloadToken(t, token.Id)
	assert.Equal(t, "quota", stored.Name)
	assert.Equal(t, 300, stored.RemainQuota)

	// A quota change without the expected values is a parameter error.
	response, extra, _ = patchTokenForTest(t, token.Id, 1, map[string]any{"remain_quota": 1000})
	assert.False(t, response.Success)
	assert.Empty(t, extra.Code)
	assert.Equal(t, 300, reloadToken(t, token.Id).RemainQuota)

	// With matching expectations the write goes through.
	response, _, _ = patchTokenForTest(t, token.Id, 1, map[string]any{
		"remain_quota": 1000, "expected_remain_quota": 300, "expected_unlimited_quota": false,
	})
	require.True(t, response.Success, response.Message)
	assert.Equal(t, 1000, reloadToken(t, token.Id).RemainQuota)
}

func TestUpdateTokenColumnsConditionalOnQuota(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "cas", "patchcas1234567890")
	affected, err := model.UpdateTokenColumns(token.Id, 1, token.Key, map[string]any{"remain_quota": 9},
		&model.TokenQuotaExpectation{RemainQuota: 1, UnlimitedQuota: true})
	require.NoError(t, err)
	assert.EqualValues(t, 0, affected)
	assert.Equal(t, 100, reloadToken(t, token.Id).RemainQuota)

	affected, err = model.UpdateTokenColumns(token.Id, 1, token.Key, map[string]any{"remain_quota": 9},
		&model.TokenQuotaExpectation{RemainQuota: 100, UnlimitedQuota: true})
	require.NoError(t, err)
	assert.EqualValues(t, 1, affected)
	assert.Equal(t, 9, reloadToken(t, token.Id).RemainQuota)
}

func TestPatchTokenStatusRecovery(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	expired := seedToken(t, db, 1, "expired", "patchexpired123456")
	require.NoError(t, db.Model(expired).Updates(map[string]any{
		"status": common.TokenStatusExpired, "expired_time": time.Now().Add(-time.Hour).Unix(),
	}).Error)
	future := time.Now().Add(24 * time.Hour).Unix()
	response, _, _ := patchTokenForTest(t, expired.Id, 1, map[string]any{"expired_time": future})
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, expired.Id)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status)
	assert.Equal(t, future, stored.ExpiredTime)

	exhausted := seedToken(t, db, 1, "exhausted", "patchexhausted1234")
	require.NoError(t, db.Model(exhausted).Updates(map[string]any{
		"status": common.TokenStatusExhausted, "remain_quota": 0, "unlimited_quota": false,
	}).Error)
	response, _, _ = patchTokenForTest(t, exhausted.Id, 1, map[string]any{
		"remain_quota": 50, "expected_remain_quota": 0, "expected_unlimited_quota": false,
	})
	require.True(t, response.Success, response.Message)
	assert.Equal(t, common.TokenStatusEnabled, reloadToken(t, exhausted.Id).Status)

	disabled := seedToken(t, db, 1, "disabled", "patchdisabled12345")
	require.NoError(t, db.Model(disabled).Update("status", common.TokenStatusDisabled).Error)
	response, _, _ = patchTokenForTest(t, disabled.Id, 1, map[string]any{"expired_time": -1})
	require.True(t, response.Success, response.Message)
	assert.Equal(t, common.TokenStatusDisabled, reloadToken(t, disabled.Id).Status)
}

func TestPatchTokenGroupChangeClearsAutoSettings(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "auto", "patchgroup12345678")
	require.NoError(t, db.Model(token).Updates(map[string]any{
		"group": "auto", "cross_group_retry": true, "auto_groups": `["default"]`,
	}).Error)

	response, _, _ := patchTokenForTest(t, token.Id, 1, map[string]any{"group": "vip"})
	require.True(t, response.Success, response.Message)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "vip", stored.Group)
	assert.False(t, stored.CrossGroupRetry)
	assert.Empty(t, stored.AutoGroups)

	response, _, _ = patchTokenForTest(t, token.Id, 1, map[string]any{"group": "not-a-group"})
	assert.False(t, response.Success)
	assert.Equal(t, "vip", reloadToken(t, token.Id).Group)
}

func TestPatchTokenRejectsOtherUsersToken(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 2, "theirs", "patchforeign123456")
	response, _, _ := patchTokenForTest(t, token.Id, 1, map[string]any{"name": "mine"})
	assert.False(t, response.Success)
	assert.Equal(t, "theirs", reloadToken(t, token.Id).Name)
}

func TestPatchTokenValidatesInput(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "valid", "patchvalidate12345")
	response, _, _ := patchTokenForTest(t, token.Id, 1, map[string]any{"name": strings.Repeat("n", 51)})
	assert.False(t, response.Success)
	response, _, _ = patchTokenForTest(t, token.Id, 1, map[string]any{
		"remain_quota": -1, "unlimited_quota": false, "expected_remain_quota": 100, "expected_unlimited_quota": true,
	})
	assert.False(t, response.Success)
	stored := reloadToken(t, token.Id)
	assert.Equal(t, "valid", stored.Name)
	assert.Equal(t, 100, stored.RemainQuota)
	assert.True(t, stored.UnlimitedQuota)
}
