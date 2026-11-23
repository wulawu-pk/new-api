package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func fetchPublicProjectionLang(t *testing.T, task *model.Task, path, lang string) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("id", task.UserId)
	c.Params = gin.Params{{Key: "task_id", Value: task.TaskID}}
	c.Request = httptest.NewRequest(http.MethodGet, path, nil)
	c.Request.Header.Set("Accept-Language", lang)
	body, taskErr := videoFetchByIDRespBodyBuilder(c)
	require.Nil(t, taskErr)
	return string(body)
}

// API callers read the failure reason themselves, so it follows their language.
func TestVideoFetchFailReasonFollowsCallerLanguage(t *testing.T) {
	require.NoError(t, i18n.Init())
	task := seedPublicProjectionTask(t, model.TaskStatusFailure)

	for lang, want := range map[string]string{"zh-CN": "生成失败，请稍后重试", "zh-TW": "生成失敗，請稍後重試", "en": "Generation failed. Please try again later."} {
		body := fetchPublicProjectionLang(t, task, "/v1/video/generations/"+task.TaskID, lang)
		assertNoUpstreamDetails(t, body)
		var response struct {
			Data map[string]any `json:"data"`
		}
		require.NoError(t, common.UnmarshalJsonStr(body, &response))
		assert.Equal(t, want, response.Data["fail_reason"], lang)
	}
}

func TestVideoFetchOpenAIErrorFollowsCallerLanguage(t *testing.T) {
	require.NoError(t, i18n.Init())
	_, err := pluginruntime.DefaultRegistry.Register(publicProjectionPlugin, pluginruntime.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { _ = pluginruntime.DefaultRegistry.Unregister("leaky-video-upstream") })
	task := seedPublicProjectionTask(t, model.TaskStatusFailure)

	body := fetchPublicProjectionLang(t, task, "/v1/videos/"+task.TaskID, "zh-CN,zh;q=0.9")
	assertNoUpstreamDetails(t, body)
	var fields map[string]any
	require.NoError(t, common.UnmarshalJsonStr(body, &fields))
	errObj, _ := fields["error"].(map[string]any)
	assert.Equal(t, "生成失败，请稍后重试", errObj["message"])
}
