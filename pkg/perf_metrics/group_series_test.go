package perfmetrics

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupGroupSummaryDB points the package at a private SQLite file so group
// aggregation tests do not share the schema with each other.
func setupGroupSummaryDB(t *testing.T) {
	t.Helper()
	oldDB, oldPath, oldMaster, oldRedis := model.DB, common.SQLitePath, common.IsMasterNode, common.RedisEnabled
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	common.SQLitePath, common.IsMasterNode, common.RedisEnabled = filepath.Join(t.TempDir(), "perf-group-wide.db"), false, false
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
}

// A 7-day window holds 168 hourly rows. The status page draws at most 24 bars,
// so the series must cover the whole week in wider buckets instead of quietly
// becoming "the last day".
func TestGroupSeriesCoversWideWindow(t *testing.T) {
	setupGroupSummaryDB(t)

	now := time.Now()
	hour := now.Unix() - now.Unix()%3600
	// 48 hourly rows: far more than 24 points, far less than a full week.
	for i := int64(1); i <= 48; i++ {
		row := model.PerfMetric{
			ModelName:      "model-1",
			Group:          "gpt-pro",
			BucketTs:       hour - i*3600,
			RequestCount:   10,
			SuccessCount:   10,
			TotalLatencyMs: 10000,
		}
		require.NoError(t, model.UpsertPerfMetric(&row))
	}

	result, err := QueryGroupSummaryAll(168, []string{"gpt-pro"})
	require.NoError(t, err)
	require.Len(t, result.Groups, 1)
	summary := result.Groups[0]

	assert.Equal(t, int64(480), summary.RequestCount)
	// 48 rows collapse into 24 buckets of two hours each.
	require.Len(t, summary.Series, 24)
	assert.Equal(t, 100.0, summary.Series[0].SuccessRate)
	// Buckets stay in ascending time order and every request is represented.
	assert.Less(t, summary.Series[0].Ts, summary.Series[len(summary.Series)-1].Ts)
	// The oldest sample is inside the first quarter of the window, proving the
	// series was not trimmed to the most recent day.
	assert.Less(t, summary.Series[0].Ts, result.WindowEnd-int64(24*3600))
}

// A short window has no reason to merge anything, so every hour keeps its own
// point.
func TestGroupSeriesKeepsHourlyPointsWhenTheyFit(t *testing.T) {
	setupGroupSummaryDB(t)

	now := time.Now()
	hour := now.Unix() - now.Unix()%3600
	for i := int64(1); i <= 5; i++ {
		row := model.PerfMetric{
			ModelName:      "model-1",
			Group:          "gpt-pro",
			BucketTs:       hour - i*3600,
			RequestCount:   2,
			SuccessCount:   1,
			TotalLatencyMs: 2000,
		}
		require.NoError(t, model.UpsertPerfMetric(&row))
	}

	result, err := QueryGroupSummaryAll(24, []string{"gpt-pro"})
	require.NoError(t, err)
	require.Len(t, result.Groups, 1)
	assert.Len(t, result.Groups[0].Series, 5)
	assert.Equal(t, 50.0, result.Groups[0].Series[0].SuccessRate)
	assert.Equal(t, hour-5*3600, result.Groups[0].Series[0].Ts)
}
