package relay

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const publicProjectionUpstreamReason = "video generation failed: supergpt account pool exhausted, see https://api.supergpt.dev/v1/videos/vid_0123456789abcdef0123456789"

// A renderer shaped like the live video plugin (only whitelisted task data at
// the top level) that also copies upstream text, fail_reason and the whole task
// data into its own error object. The host must replace that object.
const publicProjectionPlugin = `
export const meta = {
  apiVersion: 1, key: "leaky-video-upstream", name: "Leaky Video", version: "1.0.0",
  author: {name: "Test"}, models: ["leaky-video"], fetchMode: "per_task",
  protocols: ["openai_video"],
};
export function buildSubmitRequest(ctx) { return {url: ctx.baseUrl + "/v1/videos", method: "POST"}; }
export function parseSubmitResponse(ctx, resp) { return {taskId: "vid_1"}; }
export function buildQueryRequest(ctx) { return {url: ctx.baseUrl + "/v1/videos/" + ctx.taskId}; }
export function parseTaskResult(ctx, body) { return {status: "FAILURE"}; }
export function listArtifacts() { return []; }
export function buildContentRequest() { throw new Error("artifact_not_found"); }
export const protocols = {openai_video: {
  decodeRequest: function(ctx) { return {kind: "submit", model: ctx.model, requestBody: ctx.body.value}; },
  render: function(ctx, task) {
    const out = {id: task.task_id, seconds: (task.data || {}).seconds};
    out.error = {code: "supergpt_pool_error", message: "account pool exhausted: " + task.fail_reason + " " + JSON.stringify(task.data)};
    return out;
  }
}};
`

func seedPublicProjectionTask(t *testing.T, status model.TaskStatus) *model.Task {
	t.Helper()
	database := setupRelayChannelDB(t)
	require.NoError(t, database.AutoMigrate(&model.Task{}))
	task := &model.Task{
		TaskID: "task_public_projection", Platform: "leaky-video-upstream", UserId: 7, ChannelId: 61,
		Action: constant.TaskActionTextToVideo, Status: status, Progress: "100%",
		FailReason: publicProjectionUpstreamReason,
		Data:       []byte(`{"price":0.42,"content_url":"https://api.supergpt.dev/v1/videos/vid_1/content","seconds":"8"}`),
		Properties: model.Properties{OriginModelName: "leaky-video"},
	}
	if status == model.TaskStatusSuccess {
		task.FailReason = ""
		task.PrivateData.ResultURL = "https://api.supergpt.dev/v1/videos/vid_1/content"
	}
	require.NoError(t, database.Create(task).Error)
	return task
}

func fetchPublicProjection(t *testing.T, task *model.Task, path string) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("id", task.UserId)
	c.Params = gin.Params{{Key: "task_id", Value: task.TaskID}}
	c.Request = httptest.NewRequest(http.MethodGet, path, nil)
	body, taskErr := videoFetchByIDRespBodyBuilder(c)
	require.Nil(t, taskErr)
	return string(body)
}

func assertNoUpstreamDetails(t *testing.T, body string) {
	t.Helper()
	lower := strings.ToLower(body)
	for _, forbidden := range []string{"supergpt", "account pool", "leaky-video-upstream", "0.42", "price", "content_url", `"channel_id":61`, "vid_0123"} {
		assert.NotContains(t, lower, forbidden)
	}
}

func TestVideoFetchGenericTaskDtoUsesPublicProjection(t *testing.T) {
	task := seedPublicProjectionTask(t, model.TaskStatusFailure)

	body := fetchPublicProjection(t, task, "/v1/video/generations/"+task.TaskID)

	assertNoUpstreamDetails(t, body)
	var response struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, common.UnmarshalJsonStr(body, &response))
	assert.Equal(t, float64(0), response.Data["channel_id"])
	assert.Nil(t, response.Data["data"])
	assert.Equal(t, "Video", response.Data["platform"])
	assert.Equal(t, service.PublicTaskFailureFailed, response.Data["fail_reason"])
	assert.NotContains(t, response.Data, "result_url")
	assert.Equal(t, task.TaskID, response.Data["task_id"])
}

func TestVideoFetchGenericTaskDtoKeepsSiteResultURL(t *testing.T) {
	task := seedPublicProjectionTask(t, model.TaskStatusSuccess)

	body := fetchPublicProjection(t, task, "/v1/video/generations/"+task.TaskID)

	assertNoUpstreamDetails(t, body)
	assert.Contains(t, body, `/v1/videos/`+task.TaskID+`/content`)
}

func TestVideoFetchOpenAIFormatUsesPublicError(t *testing.T) {
	_, err := pluginruntime.DefaultRegistry.Register(publicProjectionPlugin, pluginruntime.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { _ = pluginruntime.DefaultRegistry.Unregister("leaky-video-upstream") })
	task := seedPublicProjectionTask(t, model.TaskStatusFailure)

	body := fetchPublicProjection(t, task, "/v1/videos/"+task.TaskID)

	assertNoUpstreamDetails(t, body)
	var fields map[string]any
	require.NoError(t, common.UnmarshalJsonStr(body, &fields))
	assert.Equal(t, task.TaskID, fields["id"])
	assert.Equal(t, "failed", fields["status"])
	assert.Equal(t, "8", fields["seconds"])
	assert.Equal(t, map[string]any{
		"code":    service.PublicTaskFailureCodeFailed,
		"message": service.PublicTaskFailureFailed,
	}, fields["error"])
}

func TestPublicTaskDtoAdminKeepsRawFields(t *testing.T) {
	task := &model.Task{
		TaskID: "task_admin", Platform: "leaky-video-upstream", ChannelId: 61, Status: model.TaskStatusFailure,
		Action: constant.TaskActionTextToVideo, FailReason: publicProjectionUpstreamReason, Data: []byte(`{"price":0.42}`),
	}
	admin := PublicTaskDto(task, true)
	assert.Equal(t, 61, admin.ChannelId)
	assert.Equal(t, publicProjectionUpstreamReason, admin.FailReason)
	assert.Equal(t, "leaky-video-upstream", admin.Platform)
	assert.JSONEq(t, `{"price":0.42}`, string(admin.Data))

	customer := PublicTaskDto(task, false)
	assert.Zero(t, customer.ChannelId)
	assert.Nil(t, customer.Data)
	assert.Equal(t, service.PublicTaskFailureFailed, customer.FailReason)
	assert.Empty(t, customer.ResultURL, "a failed legacy task must not expose FailReason as a result URL")
}
