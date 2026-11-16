package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInjectTieredBillingInfoRecordsKiroCredits(t *testing.T) {
	info := kiroRelayInfo(1.85, map[string]any{"provider": "kiro", "credits": 0.0442})
	ok, _, result := TryTieredSettle(info, billingexpr.TokenParams{P: 100, C: 50})
	require.True(t, ok)
	require.NotNil(t, result)

	other := model.NewLogOther()
	InjectTieredBillingInfo(other, info, result)
	snap := other.Snapshot()
	assert.Equal(t, "credit", snap["matched_tier"])
	assert.Equal(t, 0.0442, snap["credits"])
}

func TestInjectTieredBillingInfoSkipsCreditsWithoutProviderUsage(t *testing.T) {
	info := kiroRelayInfo(1, nil)
	ok, _, result := TryTieredSettle(info, billingexpr.TokenParams{P: 100, C: 50})
	require.True(t, ok)

	other := model.NewLogOther()
	InjectTieredBillingInfo(other, info, result)
	_, present := other.Snapshot()["credits"]
	assert.False(t, present)
}

func TestRecordProviderCreditsIgnoresNonNumericCredits(t *testing.T) {
	other := model.NewLogOther()
	recordProviderCredits(other, &relaycommon.RelayInfo{ProviderUsage: map[string]any{"credits": "1"}})
	_, present := other.Snapshot()["credits"]
	assert.False(t, present)
}

func TestInjectTieredBillingInfoPublishesTierPricesNotExpression(t *testing.T) {
	info := kiroRelayInfo(1.85, map[string]any{"provider": "kiro", "credits": 0.0442})
	ok, _, result := TryTieredSettle(info, billingexpr.TokenParams{P: 100, C: 50})
	require.True(t, ok)

	other := model.NewLogOther()
	InjectTieredBillingInfo(other, info, result)
	snap := other.Snapshot()
	assert.NotContains(t, snap, "expr_b64")
	assert.NotContains(t, snap, "request_rules")
	adminInfo, isMap := snap["admin_info"].(map[string]any)
	require.True(t, isMap)
	assert.NotEmpty(t, adminInfo["expr_b64"])
	prices, isPrices := snap["tier_prices"].(*billingexpr.TierPrices)
	require.True(t, isPrices)
	assert.Equal(t, billingexpr.TierPriceUnitCredit, prices.Unit)
	// kiroCreditExpr prices a credit at 0.25 before the group ratio.
	assert.Equal(t, map[string]float64{"credits": 0.4625}, prices.PerUnit)
}

func TestInjectTieredBillingInfoTokenFallbackPricesIncludeGroupRatio(t *testing.T) {
	info := kiroRelayInfo(1.85, nil)
	ok, _, result := TryTieredSettle(info, billingexpr.TokenParams{P: 100, C: 50})
	require.True(t, ok)
	require.Equal(t, "token", result.MatchedTier)

	other := model.NewLogOther()
	InjectTieredBillingInfo(other, info, result)
	prices, isPrices := other.Snapshot()["tier_prices"].(*billingexpr.TierPrices)
	require.True(t, isPrices)
	assert.Equal(t, billingexpr.TierPriceUnitToken, prices.Unit)
	assert.InDelta(t, 2*1.85, prices.PerMillion["p"], 1e-9)
}

func TestInjectTieredBillingInfoSkipsTierPricesForNonLinearTier(t *testing.T) {
	info := makeRelayInfo(`tier("base", max(p, 100) * 2)`, 1, 1000, 0)
	ok, _, result := TryTieredSettle(info, billingexpr.TokenParams{P: 100, C: 50})
	require.True(t, ok)

	other := model.NewLogOther()
	InjectTieredBillingInfo(other, info, result)
	snap := other.Snapshot()
	assert.NotContains(t, snap, "tier_prices")
	assert.Equal(t, "base", snap["matched_tier"])
}
