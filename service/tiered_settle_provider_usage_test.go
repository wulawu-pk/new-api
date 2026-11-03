package service

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// kiroCreditExpr is the documented peroai kiro expression: $0.25 of quota per
// upstream credit, token prices otherwise. v1 output is $/1M tokens, so the
// per-credit dollar price is scaled by 1e6. fixed() cannot be used because
// it only accepts numeric literals.
const kiroCreditExpr = `u("provider") == "kiro" ? tier("credit", u("credits") * 0.25 * 1000000) : tier("token", p * 2 + c * 10 + cr * 0.1)`

func kiroRelayInfo(groupRatio float64, providerUsage map[string]any) *relaycommon.RelayInfo {
	info := makeRelayInfo(kiroCreditExpr, groupRatio, 1000, 0)
	info.TieredBillingSnapshot.ExprVersion = 1
	info.BillingRequestInput = &billingexpr.RequestInput{Body: []byte(`{"model":"claude-sonnet-5-5"}`)}
	info.ProviderUsage = providerUsage
	return info
}

func TestTryTieredSettleBillsKiroCredits(t *testing.T) {
	for _, tc := range []struct {
		credits    float64
		groupRatio float64
		want       int
	}{
		{credits: 0.0382, groupRatio: 1, want: 4775}, // 0.0382 * 0.25 * 500000
		{credits: 0.0442, groupRatio: 1, want: 5525},
		{credits: 0.0442, groupRatio: 2, want: 11050},
		{credits: 0, groupRatio: 1, want: 0},
	} {
		info := kiroRelayInfo(tc.groupRatio, map[string]any{"provider": "kiro", "credits": tc.credits})

		ok, quota, result := TryTieredSettle(info, billingexpr.TokenParams{P: 3470, C: 49})

		require.True(t, ok)
		require.NotNil(t, result)
		assert.Equal(t, "credit", result.MatchedTier)
		// quota = credits * 0.25 * QuotaPerUnit * GroupRatio, independent of tokens
		assert.Equal(t, tc.want, quota, "credits=%v group=%v", tc.credits, tc.groupRatio)
		assert.InDelta(t, tc.credits*0.25*testQuotaPerUnit*tc.groupRatio, float64(quota), 0.5)
		assert.Nil(t, info.BillingRequestInput.Usage, "frozen request input must not be mutated")
	}
}

func TestTryTieredSettleKiroExprFallsBackToTokens(t *testing.T) {
	info := kiroRelayInfo(1, nil)

	ok, quota, result := TryTieredSettle(info, billingexpr.TokenParams{P: 1000, C: 500, CR: 2000})

	require.True(t, ok)
	require.NotNil(t, result)
	assert.Equal(t, "token", result.MatchedTier)
	// (1000*2 + 500*10 + 2000*0.1) / 1e6 * 500000 = 3600
	assert.Equal(t, 3600, quota)
}

func TestTryTieredSettleKiroExprIgnoresOtherProviders(t *testing.T) {
	info := kiroRelayInfo(1, map[string]any{"provider": "other", "credits": 9.0})

	ok, quota, result := TryTieredSettle(info, billingexpr.TokenParams{P: 1000, C: 500})

	require.True(t, ok)
	assert.Equal(t, "token", result.MatchedTier)
	assert.Equal(t, 3500, quota)
}

func TestTryTieredSettleMergesProviderUsageOverRequestUsage(t *testing.T) {
	info := kiroRelayInfo(1, map[string]any{"provider": "kiro", "credits": 0.1})
	info.BillingRequestInput.Usage = map[string]any{"credits": 99.0, "other": "kept"}

	ok, quota, _ := TryTieredSettle(info, billingexpr.TokenParams{})

	require.True(t, ok)
	assert.Equal(t, 12500, quota)
	assert.Equal(t, map[string]any{"credits": 99.0, "other": "kept"}, info.BillingRequestInput.Usage)
}
