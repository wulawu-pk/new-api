package perfmetrics

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// QueryGroupSummaryAll weights each group by its request count across every
// model in the group and returns the busiest group first.
func TestGroupSummaryAggregatesPerGroup(t *testing.T) {
	oldDB, oldPath, oldMaster, oldRedis := model.DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	common.SQLitePath, common.IsMasterNode, common.RedisEnabled = filepath.Join(t.TempDir(), "perf-group.db"), false, false
	t.Setenv("SQL_DSN", "")
	hotBuckets.Clear()
	t.Cleanup(func() {
		model.DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled = oldDB, oldPath, oldMaster, oldRedis
		common.SetDatabaseTypes(oldType, oldLogType)
		hotBuckets.Clear()
	})
	require.NoError(t, model.InitDB())
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	require.NoError(t, model.DB.Migrator().DropTable(&model.PerfMetric{}))
	require.NoError(t, model.DB.AutoMigrate(&model.PerfMetric{}))

	now := time.Now()
	start, _ := queryWindow(now, 24)
	hour := now.Unix() - now.Unix()%3600 - 3600
	nextHour := hour + 3600

	// Two groups x two models x two hourly buckets.
	for _, row := range []model.PerfMetric{
		{ModelName: "model-1", Group: "gpt-pro", BucketTs: hour, RequestCount: 100, SuccessCount: 100, TotalLatencyMs: 100000, TtftSumMs: 10000, TtftCount: 100, OutputTokens: 200, GenerationMs: 40000},
		{ModelName: "model-2", Group: "gpt-pro", BucketTs: hour, RequestCount: 50, SuccessCount: 25, TotalLatencyMs: 50000},
		{ModelName: "model-1", Group: "gpt-pro", BucketTs: nextHour, RequestCount: 20, SuccessCount: 20, TotalLatencyMs: 20000, TtftSumMs: 4000, TtftCount: 20, OutputTokens: 100, GenerationMs: 20000},
		{ModelName: "model-1", Group: "gpt-test", BucketTs: hour, RequestCount: 30, TotalLatencyMs: 30000},
		{ModelName: "model-2", Group: "gpt-test", BucketTs: nextHour, RequestCount: 10, SuccessCount: 5, TotalLatencyMs: 15000},
		// An unknown group must never reach the response.
		{ModelName: "model-3", Group: "hidden-group", BucketTs: hour, RequestCount: 500, SuccessCount: 500, TotalLatencyMs: 500000},
		// Outside the window.
		{ModelName: "model-1", Group: "gpt-pro", BucketTs: start - 3600, RequestCount: 900, SuccessCount: 900, TotalLatencyMs: 900000},
	} {
		row := row
		require.NoError(t, model.UpsertPerfMetric(&row))
	}

	allowed := []string{"gpt-pro", "gpt-test"}
	result, err := QueryGroupSummaryAll(24, allowed)
	require.NoError(t, err)
	assert.Equal(t, start, result.WindowStart)

	byGroup := lo.KeyBy(result.Groups, func(summary GroupSummary) string { return summary.Group })
	require.Len(t, byGroup, 2, "only allowed groups are reported")
	assert.NotContains(t, byGroup, "hidden-group")

	pro := byGroup["gpt-pro"]
	assert.Equal(t, int64(170), pro.RequestCount)
	assert.Equal(t, 85.29, pro.SuccessRate)        // 145 / 170
	assert.Equal(t, int64(1000), pro.AvgLatencyMs) // 170000 / 170
	assert.Equal(t, int64(116), pro.AvgTtftMs)     // 14000 / 120
	assert.Equal(t, 5.0, pro.AvgTps)               // 300 tokens / 60s
	require.Len(t, pro.Series, 2)
	assert.Equal(t, hour, pro.Series[0].Ts)
	assert.Equal(t, nextHour, pro.Series[1].Ts)
	assert.InDelta(t, 83.33, pro.Series[0].SuccessRate, 0.01) // 125 / 150
	assert.Equal(t, 100.0, pro.Series[1].SuccessRate)

	test := byGroup["gpt-test"]
	assert.Equal(t, int64(40), test.RequestCount)
	assert.Equal(t, 12.5, test.SuccessRate)         // 5 / 40
	assert.Equal(t, int64(1125), test.AvgLatencyMs) // 45000 / 40
	assert.Equal(t, int64(0), test.AvgTtftMs, "no TTFT samples stays zero")
	assert.Equal(t, 0.0, test.AvgTps)
	assert.InDelta(t, 0.0, pro.AvgTps-5.0, 0.0001, "throughput is rounded to two decimals")

	// Busiest group first.
	require.Len(t, result.Groups, 2)
	assert.Equal(t, "gpt-pro", result.Groups[0].Group)
	assert.Equal(t, "gpt-test", result.Groups[1].Group)
	assert.Greater(t, result.Groups[0].RequestCount, result.Groups[1].RequestCount)

	// A group subset filters both rows and hot buckets; an empty slice denies all.
	onlyTest, err := QueryGroupSummaryAll(24, []string{"gpt-test"})
	require.NoError(t, err)
	require.Len(t, onlyTest.Groups, 1)
	assert.Equal(t, "gpt-test", onlyTest.Groups[0].Group)

	none, err := QueryGroupSummaryAll(24, []string{})
	require.NoError(t, err)
	assert.Empty(t, none.Groups)

	// The open (unflushed) hour is folded into the group totals and the series.
	hot := &atomicBucket{}
	hot.add(Sample{Success: true, LatencyMs: 500, HasTtft: true, TtftMs: 50})
	hotBuckets.Store(bucketKey{model: "model-2", group: "gpt-test", bucketTs: nextHour}, hot)
	withHot, err := QueryGroupSummaryAll(24, allowed)
	require.NoError(t, err)
	hotTest := lo.KeyBy(withHot.Groups, func(summary GroupSummary) string { return summary.Group })["gpt-test"]
	assert.Equal(t, int64(41), hotTest.RequestCount)
	assert.InDelta(t, 14.63, hotTest.SuccessRate, 0.01) // 6 / 41
	assert.Equal(t, int64(50), hotTest.AvgTtftMs)

	encoded, err := common.Marshal(result)
	require.NoError(t, err)
	t.Logf("GET /api/perf-metrics/groups?hours=24 -> %s", string(encoded))
	for _, field := range []string{`"group":"gpt-pro"`, `"request_count":170`, `"success_rate":85.29`, `"avg_latency_ms":1000`, `"avg_ttft_ms":116`, `"avg_tps":5`, `"window_start"`, `"window_end"`} {
		assert.Contains(t, string(encoded), field)
	}
	assert.NotContains(t, string(encoded), "hidden-group")
}
