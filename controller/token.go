package controller

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type tokenAutoGroupsInput struct {
	Set    bool
	Groups []string
}

func (input *tokenAutoGroupsInput) UnmarshalJSON(data []byte) error {
	input.Set = true
	if strings.TrimSpace(string(data)) == "null" {
		input.Groups = nil
		return nil
	}
	return common.Unmarshal(data, &input.Groups)
}

type tokenRequest struct {
	model.Token
	AutoGroups tokenAutoGroupsInput `json:"auto_groups"`
	// 指针区分“未传”和显式 false：新建时未传即开启，更新时未传则保留原值。
	AllowUserQuotaQuery *bool `json:"allow_user_quota_query"`
	// peroai: the quota the editor saw when it opened the token (full PUT only).
	// When the submitted quota equals it, the quota is left alone, so a rename
	// never restores spend; when it differs, the write is compare-and-set
	// against it and a concurrent change answers token_conflict.
	ExpectedRemainQuota    *int  `json:"expected_remain_quota"`
	ExpectedUnlimitedQuota *bool `json:"expected_unlimited_quota"`
}

type tokenResponse struct {
	*model.Token
	AutoGroups []string `json:"auto_groups"`
}

func maxTokenQuota() int {
	quota, err := common.WalletQuotaFromDecimalStrict(
		decimal.NewFromInt(1_000_000_000).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
	)
	if err != nil {
		return common.MaxWalletQuota
	}
	return quota
}

func buildMaskedTokenResponse(token *model.Token) *tokenResponse {
	if token == nil {
		return nil
	}
	maskedToken := *token
	maskedToken.Key = token.GetMaskedKey()
	autoGroups, err := token.GetAutoGroups()
	if err != nil {
		common.SysError(common.LogText("failed to parse auto groups for token %d: %v", token.Id, err))
		autoGroups = nil
	}
	if len(autoGroups) == 0 {
		autoGroups = nil
	}
	return &tokenResponse{Token: &maskedToken, AutoGroups: autoGroups}
}

func buildMaskedTokenResponses(tokens []*model.Token) []*tokenResponse {
	maskedTokens := make([]*tokenResponse, 0, len(tokens))
	for _, token := range tokens {
		maskedTokens = append(maskedTokens, buildMaskedTokenResponse(token))
	}
	return maskedTokens
}

func getTokenRequestUserGroup(c *gin.Context) (string, error) {
	if userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup); userGroup != "" {
		return userGroup, nil
	}
	if userGroup := c.GetString("group"); userGroup != "" {
		return userGroup, nil
	}
	return model.GetUserGroup(c.GetInt("id"), false)
}

// requireTokenGroup rejects a token without a group, or with a group the
// user cannot select (peroai: every key must pick its group explicitly).
func requireTokenGroup(c *gin.Context, group string) bool {
	if group == "" {
		common.ApiErrorT(c, "Please select a group")
		return false
	}
	if group == "auto" {
		// setTokenAutoGroups validates the auto order; the auth middleware
		// rejects auto at request time when it is not offered to the user.
		return true
	}
	userGroup, err := getTokenRequestUserGroup(c)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	if service.IsUserSelectableGroup(userGroup, group) {
		return true
	}
	common.ApiErrorT(c, "Group {{group}} is not available", map[string]any{"group": group})
	return false
}

func setTokenAutoGroups(c *gin.Context, token *model.Token, groups []string) bool {
	if len(groups) == 0 {
		if err := token.SetAutoGroups(nil); err != nil {
			common.ApiError(c, err)
			return false
		}
		return true
	}

	maxCount := setting.GetMaxTokenAutoGroups()
	if len(groups) > maxCount {
		common.ApiErrorT(c, "A token can select at most {{max}} Auto groups", map[string]any{"max": maxCount})
		return false
	}

	userGroup, err := getTokenRequestUserGroup(c)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	seen := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		if _, ok := seen[group]; ok {
			common.ApiErrorT(c, "Auto group {{group}} is duplicated", map[string]any{"group": group})
			return false
		}
		seen[group] = struct{}{}
		if !service.IsUserSelectableGroup(userGroup, group) {
			common.ApiErrorT(c, "Auto group {{group}} is unavailable or unauthorized", map[string]any{"group": group})
			return false
		}
	}

	if err := token.SetAutoGroups(groups); err != nil {
		common.ApiError(c, err)
		return false
	}
	return true
}

func GetAllTokens(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	total, _ := model.CountUserTokens(userId)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func SearchTokens(c *gin.Context) {
	userId := c.GetInt("id")
	keyword := c.Query("keyword")
	token := c.Query("token")

	pageInfo := common.GetPageQuery(c)

	tokens, total, err := model.SearchUserTokens(userId, keyword, token, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func GetToken(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildMaskedTokenResponse(token))
}

func GetTokenAutoGroups(c *gin.Context) {
	userGroup, err := getTokenRequestUserGroup(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"groups":    service.GetUserAutoGroup(userGroup),
		"max_count": setting.GetMaxTokenAutoGroups(),
	})
}

func GetTokenKey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params := tokenAuditParams(c)
	params["id"], params["name"] = token.Id, token.Name
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	common.ApiSuccess(c, gin.H{
		"key": token.GetFullKey(),
	})
}

func GetTokenStatus(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	userId := c.GetInt("id")
	token, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}
	c.JSON(http.StatusOK, gin.H{
		"object":          "credit_summary",
		"total_granted":   token.RemainQuota,
		"total_used":      0, // not supported currently
		"total_available": token.RemainQuota,
		"expires_at":      expiredAt * 1000,
	})
}

func GetTokenUsage(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "No Authorization header",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid Bearer token",
		})
		return
	}
	tokenKey := parts[1]

	token, err := model.GetTokenByKey(strings.TrimPrefix(tokenKey, "sk-"), false)
	if err != nil {
		common.SysError(common.LogText("failed to get token by key: %s", err.Error()))
		common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
		return
	}

	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}

	data := gin.H{
		"object":               "token_usage",
		"name":                 token.Name,
		"total_granted":        token.RemainQuota + token.UsedQuota,
		"total_used":           token.UsedQuota,
		"total_available":      token.RemainQuota,
		"unlimited_quota":      token.UnlimitedQuota,
		"model_limits":         token.GetModelLimitsMap(),
		"model_limits_enabled": token.ModelLimitsEnabled,
		"expires_at":           expiredAt,
	}
	// 用户额度只在令牌允许时返回；IP 白名单已由 TokenAuthReadOnly 检查。
	if token.AllowUserQuotaQuery {
		userQuota, err := model.GetUserQuota(token.UserId, false)
		var userUsedQuota int
		if err == nil {
			userUsedQuota, err = model.GetUserUsedQuota(token.UserId)
		}
		if err != nil {
			common.SysError(common.LogText("failed to get user quota: %s", err.Error()))
			common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
			return
		}
		data["user_quota"] = gin.H{
			"total_available": userQuota,
			"total_used":      userUsedQuota,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    true,
		"message": "ok",
		"data":    data,
	})
}

func AddToken(c *gin.Context) {
	request := tokenRequest{}
	err := c.ShouldBindJSON(&request)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token := request.Token
	if len(token.Name) > 50 {
		common.ApiErrorT(c, "Token name is too long")
		return
	}
	params := tokenAuditParams(c)
	params["name"] = token.Name
	// 非无限额度时，检查额度值是否超出有效范围
	if !token.UnlimitedQuota {
		if token.RemainQuota < 0 {
			common.ApiErrorT(c, "Quota value cannot be negative")
			return
		}
		maxQuotaValue := maxTokenQuota()
		if token.RemainQuota > maxQuotaValue {
			common.ApiErrorT(c, "Quota value exceeds valid range, maximum is {{max}}", map[string]any{"max": logger.FormatQuota(maxQuotaValue)})
			return
		}
	}
	// 检查用户令牌数量是否已达上限
	maxTokens := operation_setting.GetMaxUserTokens()
	count, err := model.CountUserTokens(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if int(count) >= maxTokens {
		common.ApiErrorT(c, "Maximum number of tokens reached ({{max}})", map[string]any{"max": maxTokens})
		return
	}
	if !requireTokenGroup(c, token.Group) {
		return
	}
	if token.Group == "auto" {
		if !setTokenAutoGroups(c, &token, request.AutoGroups.Groups) {
			return
		}
	} else {
		token.CrossGroupRetry = false
		_ = token.SetAutoGroups(nil)
	}
	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorT(c, "Failed to generate token")
		common.SysLog(common.LogText("failed to generate token key: %s", err.Error()))
		return
	}
	cleanToken := model.Token{
		UserId:             c.GetInt("id"),
		Name:               token.Name,
		Key:                key,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        token.ExpiredTime,
		RemainQuota:        token.RemainQuota,
		UnlimitedQuota:     token.UnlimitedQuota,
		ModelLimitsEnabled: token.ModelLimitsEnabled,
		ModelLimits:        token.ModelLimits,
		AllowIps:           token.AllowIps,
		Group:              token.Group,
		CrossGroupRetry:    token.CrossGroupRetry,
		AutoGroups:         token.AutoGroups,
	}
	cleanToken.AllowUserQuotaQuery = request.AllowUserQuotaQuery == nil || *request.AllowUserQuotaQuery
	err = cleanToken.Insert()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params["id"] = cleanToken.Id
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	// Return the new token's id so the console can open it; never the key.
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"id":   cleanToken.Id,
			"name": cleanToken.Name,
		},
	})
}

func DeleteToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params := tokenAuditParams(c)
	params["id"], params["name"] = token.Id, token.Name
	err = token.Delete()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateToken(c *gin.Context) {
	userId := c.GetInt("id")
	statusOnly := c.Query("status_only")
	request := tokenRequest{}
	err := c.ShouldBindJSON(&request)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token := request.Token
	params := tokenAuditParams(c)
	if token.Id > 0 {
		params["id"] = token.Id
	}
	if len(token.Name) > 50 {
		common.ApiErrorT(c, "Token name is too long")
		return
	}
	if !token.UnlimitedQuota {
		if token.RemainQuota < 0 {
			common.ApiErrorT(c, "Quota value cannot be negative")
			return
		}
		maxQuotaValue := maxTokenQuota()
		if token.RemainQuota > maxQuotaValue {
			common.ApiErrorT(c, "Quota value exceeds valid range, maximum is {{max}}", map[string]any{"max": logger.FormatQuota(maxQuotaValue)})
			return
		}
	}
	cleanToken, err := model.GetTokenByIds(token.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params["name"] = cleanToken.Name
	previous := *cleanToken
	if token.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			common.ApiErrorT(c, "Token has expired and cannot be enabled. Please modify the expiration time or set it to never expire")
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			common.ApiErrorT(c, "Token quota is exhausted and cannot be enabled. Please modify the remaining quota or set it to unlimited")
			return
		}
	}
	if statusOnly != "" {
		// Write the status column alone, conditional on the status that was
		// read, so a concurrent spend, edit or toggle is never undone.
		params["from"], params["to"] = previous.Status, token.Status
		if token.Status != previous.Status {
			expectedStatus := previous.Status
			if !applyTokenColumns(c, &previous, userId, map[string]any{"status": token.Status},
				&model.TokenColumnExpectation{Status: &expectedStatus}) {
				return
			}
		}
	} else {
		if !requireTokenGroup(c, token.Group) {
			return
		}
		cleanToken.Name = token.Name
		cleanToken.ExpiredTime = token.ExpiredTime
		cleanToken.RemainQuota = token.RemainQuota
		cleanToken.UnlimitedQuota = token.UnlimitedQuota
		cleanToken.ModelLimitsEnabled = token.ModelLimitsEnabled
		cleanToken.ModelLimits = token.ModelLimits
		cleanToken.AllowIps = token.AllowIps
		if request.AllowUserQuotaQuery != nil {
			cleanToken.AllowUserQuotaQuery = *request.AllowUserQuotaQuery
		}
		cleanToken.Group = token.Group
		cleanToken.CrossGroupRetry = token.CrossGroupRetry
		if token.Group != "auto" {
			cleanToken.CrossGroupRetry = false
			_ = cleanToken.SetAutoGroups(nil)
		} else if request.AutoGroups.Set {
			if !setTokenAutoGroups(c, cleanToken, request.AutoGroups.Groups) {
				return
			}
		}
		// Write only the columns that differ from the row that was read.
		columns := map[string]any{}
		changedFields := []string{}
		for _, field := range []struct {
			name    string
			changed bool
			value   any
		}{
			{"name", previous.Name != cleanToken.Name, cleanToken.Name},
			{"expired_time", previous.ExpiredTime != cleanToken.ExpiredTime, cleanToken.ExpiredTime},
			{"remain_quota", previous.RemainQuota != cleanToken.RemainQuota, cleanToken.RemainQuota},
			{"unlimited_quota", previous.UnlimitedQuota != cleanToken.UnlimitedQuota, cleanToken.UnlimitedQuota},
			{"model_limits_enabled", previous.ModelLimitsEnabled != cleanToken.ModelLimitsEnabled, cleanToken.ModelLimitsEnabled},
			{"model_limits", previous.ModelLimits != cleanToken.ModelLimits, cleanToken.ModelLimits},
			{"allow_ips", (previous.AllowIps == nil) != (cleanToken.AllowIps == nil) ||
				(previous.AllowIps != nil && cleanToken.AllowIps != nil && *previous.AllowIps != *cleanToken.AllowIps), cleanToken.AllowIps},
			{"allow_user_quota_query", previous.AllowUserQuotaQuery != cleanToken.AllowUserQuotaQuery, cleanToken.AllowUserQuotaQuery},
			{"group", previous.Group != cleanToken.Group, cleanToken.Group},
			{"cross_group_retry", previous.CrossGroupRetry != cleanToken.CrossGroupRetry, cleanToken.CrossGroupRetry},
			{"auto_groups", previous.AutoGroups != cleanToken.AutoGroups, cleanToken.AutoGroups},
		} {
			if field.changed {
				columns[field.name] = field.value
				changedFields = append(changedFields, field.name)
			}
		}
		var expected *model.TokenColumnExpectation
		seen := &model.TokenQuotaExpectation{RemainQuota: previous.RemainQuota, UnlimitedQuota: previous.UnlimitedQuota}
		if request.ExpectedRemainQuota != nil && request.ExpectedUnlimitedQuota != nil {
			seen = &model.TokenQuotaExpectation{RemainQuota: *request.ExpectedRemainQuota, UnlimitedQuota: *request.ExpectedUnlimitedQuota}
			if token.RemainQuota == seen.RemainQuota && token.UnlimitedQuota == seen.UnlimitedQuota {
				// The editor did not touch the quota: keep whatever the row holds now.
				delete(columns, "remain_quota")
				delete(columns, "unlimited_quota")
				changedFields = slices.DeleteFunc(changedFields, func(f string) bool {
					return f == "remain_quota" || f == "unlimited_quota"
				})
			} else if previous.RemainQuota != seen.RemainQuota || previous.UnlimitedQuota != seen.UnlimitedQuota {
				respondTokenConflict(c)
				return
			}
		}
		_, remainChanged := columns["remain_quota"]
		_, unlimitedChanged := columns["unlimited_quota"]
		if remainChanged || unlimitedChanged {
			// The new quota replaces the one the editor saw; a spend landing
			// in between must not be overwritten.
			expected = &model.TokenColumnExpectation{Quota: seen}
		}
		if !applyTokenColumns(c, &previous, userId, columns, expected) {
			return
		}
		params["changed_fields"] = changedFields
	}
	updated, err := model.GetTokenByIds(previous.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanToken = updated
	params["name"] = cleanToken.Name
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(cleanToken),
	})
}

// tokenPatchRequest is the body of PATCH /api/token/:id. Every field is
// optional: nil means "leave unchanged", so an editor can send only what the
// user touched and never overwrite spend or limits changed meanwhile.
type tokenPatchRequest struct {
	Name                   *string `json:"name"`
	Group                  *string `json:"group"`
	ExpiredTime            *int64  `json:"expired_time"`
	RemainQuota            *int    `json:"remain_quota"`
	UnlimitedQuota         *bool   `json:"unlimited_quota"`
	ExpectedRemainQuota    *int    `json:"expected_remain_quota"`
	ExpectedUnlimitedQuota *bool   `json:"expected_unlimited_quota"`
}

// PatchToken updates only the fields present in the body. Quota changes are
// compare-and-set against the quota the editor saw.
func PatchToken(c *gin.Context) {
	userId := c.GetInt("id")
	params := tokenAuditParams(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	params["id"] = id
	request := tokenPatchRequest{}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	quotaChange := request.RemainQuota != nil || request.UnlimitedQuota != nil
	if quotaChange && (request.ExpectedRemainQuota == nil || request.ExpectedUnlimitedQuota == nil) {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if request.Name != nil && len(*request.Name) > 50 {
		common.ApiErrorT(c, "Token name is too long")
		return
	}

	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params["name"] = token.Name
	previous := *token

	if request.RemainQuota != nil {
		token.RemainQuota = *request.RemainQuota
	}
	if request.UnlimitedQuota != nil {
		token.UnlimitedQuota = *request.UnlimitedQuota
	}
	if quotaChange && !token.UnlimitedQuota {
		if token.RemainQuota < 0 {
			common.ApiErrorT(c, "Quota value cannot be negative")
			return
		}
		maxQuotaValue := maxTokenQuota()
		if token.RemainQuota > maxQuotaValue {
			common.ApiErrorT(c, "Quota value exceeds valid range, maximum is {{max}}", map[string]any{"max": logger.FormatQuota(maxQuotaValue)})
			return
		}
	}
	if request.Group != nil {
		if !requireTokenGroup(c, *request.Group) {
			return
		}
		token.Group = *request.Group
		if token.Group != "auto" {
			token.CrossGroupRetry = false
			_ = token.SetAutoGroups(nil)
		}
	}
	if request.Name != nil {
		token.Name = *request.Name
	}
	if request.ExpiredTime != nil {
		token.ExpiredTime = *request.ExpiredTime
	}

	now := common.GetTimestamp()
	switch token.Status {
	case common.TokenStatusExpired:
		if request.ExpiredTime != nil && (token.ExpiredTime == -1 || token.ExpiredTime > now) {
			token.Status = common.TokenStatusEnabled
		}
	case common.TokenStatusExhausted:
		if quotaChange && (token.UnlimitedQuota || token.RemainQuota > 0) {
			token.Status = common.TokenStatusEnabled
		}
	}

	columns := map[string]any{}
	changedFields := []string{}
	for _, field := range []struct {
		name    string
		changed bool
		value   any
	}{
		{"name", previous.Name != token.Name, token.Name},
		{"expired_time", previous.ExpiredTime != token.ExpiredTime, token.ExpiredTime},
		{"remain_quota", previous.RemainQuota != token.RemainQuota, token.RemainQuota},
		{"unlimited_quota", previous.UnlimitedQuota != token.UnlimitedQuota, token.UnlimitedQuota},
		{"group", previous.Group != token.Group, token.Group},
		{"cross_group_retry", previous.CrossGroupRetry != token.CrossGroupRetry, token.CrossGroupRetry},
		{"auto_groups", previous.AutoGroups != token.AutoGroups, token.AutoGroups},
		{"status", previous.Status != token.Status, token.Status},
	} {
		if field.changed {
			columns[field.name] = field.value
			changedFields = append(changedFields, field.name)
		}
	}

	var expected *model.TokenColumnExpectation
	if quotaChange {
		quota := &model.TokenQuotaExpectation{
			RemainQuota:    *request.ExpectedRemainQuota,
			UnlimitedQuota: *request.ExpectedUnlimitedQuota,
		}
		if previous.RemainQuota != quota.RemainQuota || previous.UnlimitedQuota != quota.UnlimitedQuota {
			respondTokenConflict(c)
			return
		}
		expected = &model.TokenColumnExpectation{Quota: quota}
	}
	if _, ok := columns["status"]; ok {
		// Auto-recovery was decided from the status that was read; a
		// concurrent manual disable must win over it.
		if expected == nil {
			expected = &model.TokenColumnExpectation{}
		}
		expectedStatus := previous.Status
		expected.Status = &expectedStatus
	}
	if !applyTokenColumns(c, &previous, userId, columns, expected) {
		return
	}

	updated, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params["name"] = updated.Name
	params["changed_fields"] = changedFields
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	common.ApiSuccess(c, buildMaskedTokenResponse(updated))
}

// applyTokenColumns writes columns to the token, conditional on expected.
// It responds and returns false on error or when the row no longer matches
// the expected state (token_conflict).
func applyTokenColumns(c *gin.Context, token *model.Token, userId int, columns map[string]any, expected *model.TokenColumnExpectation) bool {
	if len(columns) == 0 {
		return true
	}
	affected, err := model.UpdateTokenColumns(token.Id, userId, token.Key, columns, expected)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	if affected == 0 && expected != nil {
		// Some databases (MySQL) report 0 rows when the values were
		// already in place; only a real mismatch is a conflict.
		current, err := model.GetTokenByIds(token.Id, userId)
		if err != nil {
			common.ApiError(c, err)
			return false
		}
		if !expected.Matches(current) {
			respondTokenConflict(c)
			return false
		}
	}
	return true
}

func respondTokenConflict(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"code":    "token_conflict",
		"message": i18n.T(c, i18n.MsgTokenQuotaConflict),
	})
}

type TokenBatch struct {
	Ids []int `json:"ids"`
}

func DeleteTokenBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	params := tokenBatchAuditParams(c, tokenBatch.Ids)
	if len(tokenBatch.Ids) == 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	userId := c.GetInt("id")
	count, err := model.BatchDeleteTokens(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	params["count"] = count
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}

func GetTokenKeysBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	params := tokenBatchAuditParams(c, tokenBatch.Ids)
	if len(tokenBatch.Ids) == 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if len(tokenBatch.Ids) > 100 {
		common.ApiErrorT(c, "Too many items in batch request, maximum is {{max}}", map[string]any{"max": 100})
		return
	}
	userId := c.GetInt("id")
	tokens, err := model.GetTokenKeysByIds(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	keysMap := make(map[int]string)
	returnedIDs := make([]int, 0, len(tokens))
	for _, t := range tokens {
		keysMap[t.Id] = t.GetFullKey()
		returnedIDs = append(returnedIDs, t.Id)
	}
	params["count"] = len(tokens)
	params["returned_ids"] = returnedIDs
	common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
	common.ApiSuccess(c, gin.H{"keys": keysMap})
}
