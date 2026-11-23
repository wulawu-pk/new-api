package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupPerfMetricsGroupTest(t *testing.T) {
	t.Helper()
	require.NoError(t, i18n.Init())
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.PerfMetric{}))
	previousGroups := setting.UserUsableGroups2JSONString()
	previousRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"claude-kiro":"Kiro"}`))
	// gpt-special is retired: it keeps a ratio for old logs but is not selectable.
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"claude-kiro":1,"gpt-special":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios))
	})
}

func requestPerfMetricsGroupSummary(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/perf-metrics/groups?hours=24", nil)
	ctx.Request.Header.Set("Accept-Language", "en")
	GetPerfMetricsGroupSummary(ctx)
	return recorder
}

func TestPerfMetricsGroupSummaryOnlyListsUserUsableGroups(t *testing.T) {
	setupPerfMetricsGroupTest(t)
	bucket := time.Now().Unix()
	bucket -= bucket % 3600
	for _, group := range []string{"claude-kiro", "gpt-special", "auto"} {
		require.NoError(t, model.DB.Create(&model.PerfMetric{
			ModelName: "m-" + group, Group: group, BucketTs: bucket, RequestCount: 3, SuccessCount: 3,
		}).Error)
	}

	recorder := requestPerfMetricsGroupSummary(t)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Groups []struct {
				Group string `json:"group"`
			} `json:"groups"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	groups := []string{}
	for _, g := range response.Data.Groups {
		groups = append(groups, g.Group)
	}
	assert.ElementsMatch(t, []string{"claude-kiro", "auto"}, groups)
	assert.NotContains(t, recorder.Body.String(), "gpt-special")
}

func TestPerfMetricsGroupSummaryHidesDatabaseErrors(t *testing.T) {
	setupPerfMetricsGroupTest(t)
	require.NoError(t, model.DB.Migrator().DropTable(&model.PerfMetric{}))

	recorder := requestPerfMetricsGroupSummary(t)
	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	body := recorder.Body.String()
	assert.NotContains(t, strings.ToLower(body), "no such table")
	assert.NotContains(t, body, "perf_metrics\"")
	var response tokenAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, []string{
		i18n.Translate(i18n.LangEn, i18n.MsgPerfMetricsUnavailable),
		i18n.Translate(i18n.LangZhCN, i18n.MsgPerfMetricsUnavailable),
	}, response.Message)
}
