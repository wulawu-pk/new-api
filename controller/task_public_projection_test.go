package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const taskProjectionUpstreamReason = "video generation failed: supergpt account pool exhausted, see https://api.supergpt.dev/v1/videos/vid_0123456789abcdef0123456789"

func leakyFailedVideoTask() *model.Task {
	return &model.Task{
		TaskID: "task_leaky_video", Platform: "supergpt-video", UserId: 7, ChannelId: 61,
		Action: constant.TaskActionTextToVideo, Status: model.TaskStatusFailure, Progress: "100%",
		FailReason: taskProjectionUpstreamReason,
		Data:       []byte(`{"price":0.42,"content_url":"https://api.supergpt.dev/v1/videos/vid_1/content"}`),
	}
}

func assertCustomerTaskBodyClean(t *testing.T, body string) {
	t.Helper()
	lower := strings.ToLower(body)
	for _, forbidden := range []string{"supergpt", "account pool", "0.42", "price", "content_url", "vid_0123"} {
		assert.NotContains(t, lower, forbidden)
	}
}

func TestTaskConsoleListUsesPublicFailReason(t *testing.T) {
	task := leakyFailedVideoTask()

	customer := tasksToDto([]*model.Task{task}, false, common.RoleCommonUser)[0]
	encoded, err := common.Marshal(customer)
	require.NoError(t, err)
	assertCustomerTaskBodyClean(t, string(encoded))
	assert.Zero(t, customer.ChannelId)
	assert.Nil(t, customer.Data)
	assert.Equal(t, "Video", customer.Platform)
	assert.Equal(t, service.PublicTaskFailureFailed, customer.FailReason)

	admin := tasksToDto([]*model.Task{task}, false, common.RoleAdminUser)[0]
	assert.Equal(t, 61, admin.ChannelId)
	assert.Equal(t, taskProjectionUpstreamReason, admin.FailReason)
	assert.Equal(t, "supergpt-video", admin.Platform)
	assert.Contains(t, string(admin.Data), "0.42")
}

func TestTaskConsoleListKeepsLegacyVideoDelivery(t *testing.T) {
	task := &model.Task{
		TaskID: "task_legacy_ok", Platform: "jimeng", ChannelId: 61,
		Action: constant.TaskActionTextToVideo, Status: model.TaskStatusSuccess,
		FailReason: "https://private-upstream.invalid/video.mp4",
	}
	view := tasksToDto([]*model.Task{task}, false, common.RoleCommonUser)[0]
	assert.True(t, view.LegacyVideoAvailable)
	assert.Empty(t, view.ResultURL)
	assert.Empty(t, view.FailReason)
}

func TestGetTaskUsesPublicFailReason(t *testing.T) {
	stored := setupGenericTaskTest(t)
	leaky := leakyFailedVideoTask()
	stored.Platform, stored.Action, stored.Status = leaky.Platform, leaky.Action, leaky.Status
	stored.FailReason, stored.Data, stored.ChannelId = leaky.FailReason, leaky.Data, 1
	require.NoError(t, model.DB.Save(stored).Error)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set("id", 7)
	c.Params = gin.Params{{Key: "key", Value: stored.TaskID}}
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/tasks/"+stored.TaskID, nil)

	GetTask(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assertCustomerTaskBodyClean(t, recorder.Body.String())
	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, service.PublicTaskFailureFailed, response["fail_reason"])
	assert.Equal(t, "Video", response["platform"])
	assert.Equal(t, stored.TaskID, response["task_id"])
}
