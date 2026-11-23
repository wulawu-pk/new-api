package service

import (
	"context"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const leakyTaskFailReason = "video generation failed: supergpt account pool exhausted, see https://api.supergpt.dev/v1/videos/vid_0123456789abcdef0123456789 (price 0.42)"

func TestPublicTaskFailureMapsToNeutralMessages(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		code string
		want string
	}{
		{"", PublicTaskFailureCodeFailed, PublicTaskFailureFailed},
		{"Task timed out", PublicTaskFailureCodeTimeout, PublicTaskFailureTimeout},
		{"Task timed out (a task left by the old system is not refunded; contact the administrator)", PublicTaskFailureCodeTimeout, PublicTaskFailureLegacyTimeout},
		{"video generation failed: request blocked by moderation", PublicTaskFailureCodeContentPolicy, PublicTaskFailureContentPolicy},
		{"DataInspectionFailed: see https://private.example.com/jobs/1", PublicTaskFailureCodeContentPolicy, PublicTaskFailureContentPolicy},
		{"video generation failed: seconds must be one of 4, 8, 12", PublicTaskFailureCodeInvalidParams, PublicTaskFailureInvalidParams},
		{"video generation failed: invalid api key for upstream", PublicTaskFailureCodeFailed, PublicTaskFailureFailed},
		{leakyTaskFailReason, PublicTaskFailureCodeFailed, PublicTaskFailureFailed},
		{"Upstream task not found", PublicTaskFailureCodeFailed, PublicTaskFailureFailed},
		{"something odd happened", PublicTaskFailureCodeFailed, PublicTaskFailureFailed},
	} {
		code, message := PublicTaskFailure(tc.raw)
		assert.Equal(t, tc.code, code, tc.raw)
		assert.Equal(t, tc.want, message, tc.raw)
	}
	assert.Empty(t, PublicTaskFailReasonForTask(&model.Task{Status: model.TaskStatusSuccess, FailReason: "https://upstream.invalid/v.mp4"}))
	assert.Empty(t, PublicTaskFailReasonForTask(nil))
}

func TestBuildTaskPluginViewCarriesPublicFailReason(t *testing.T) {
	view, err := BuildTaskPluginView(&model.Task{TaskID: "task_x", Status: model.TaskStatusFailure, FailReason: leakyTaskFailReason})
	require.NoError(t, err)
	assert.Equal(t, PublicTaskFailureFailed, view.FailReason)
}

// The refund log is a customer-visible exit for the async failure reason:
// the customer reads a neutral reason, the administrator the upstream text.
func TestRefundTaskQuotaLogKeepsUpstreamReasonAdminOnly(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 31, 31, 61
	seedUser(t, userID, 10000)
	seedToken(t, tokenID, userID, "sk-refund-reason", 5000)
	seedChannel(t, channelID)
	seedChargedAccounting(t, userID, channelID, tokenID, 2000, 1)

	task := makeTask(userID, channelID, 2000, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatusFailure
	task.FailReason = leakyTaskFailReason
	task.Data = []byte(`{"price":0.42,"content_url":"https://api.supergpt.dev/v1/videos/vid_1/content"}`)
	require.NoError(t, model.DB.Create(task).Error)

	require.True(t, RefundTaskQuota(ctx, task, task.FailReason))

	stored := getLastLog(t)
	require.NotNil(t, stored)
	assert.Equal(t, model.LogTypeRefund, stored.Type)
	var raw map[string]any
	require.NoError(t, common.UnmarshalJsonStr(stored.Other, &raw))
	assert.Equal(t, PublicTaskFailureFailed, raw["reason"])
	adminInfo, ok := raw["admin_info"].(map[string]any)
	require.True(t, ok, stored.Other)
	assert.Equal(t, leakyTaskFailReason, adminInfo["upstream_reason"])

	userLogs, _, err := model.GetUserLogs(userID, model.LogFilter{Type: model.LogTypeRefund}, 0, 10)
	require.NoError(t, err)
	require.Len(t, userLogs, 1)
	assert.Zero(t, userLogs[0].ChannelId)
	customer := strings.ToLower(userLogs[0].Other + userLogs[0].Content)
	for _, forbidden := range []string{"supergpt", "account pool", "upstream_reason", "admin_info", "0.42", "https://"} {
		assert.NotContains(t, customer, forbidden)
	}
	assert.Contains(t, userLogs[0].Other, PublicTaskFailureFailed)

	adminLogs, _, err := model.GetAllLogs(model.LogFilter{Type: model.LogTypeRefund}, 0, 10)
	require.NoError(t, err)
	require.Len(t, adminLogs, 1)
	assert.Contains(t, adminLogs[0].Other, "account pool")
	assert.Equal(t, channelID, adminLogs[0].ChannelId)
}
