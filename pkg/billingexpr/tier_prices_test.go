package billingexpr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const kiroTierPriceExpr = `u("provider") == "kiro" ? tier("credit", u("credits") * 0.13513513513513511 * 1000000) : tier("token", p * 2 + c * 10 + cr * 0.1 + cc * 2.5 + cc1h * 4)`

func TestComputeTierPricesKiroCreditTier(t *testing.T) {
	prices, err := ComputeTierPrices(kiroTierPriceExpr, "credit", false, 1.85)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitCredit, prices.Unit)
	assert.Equal(t, map[string]float64{"credits": 0.25}, prices.PerUnit)
	assert.Empty(t, prices.PerMillion)
	assert.Nil(t, prices.Fixed)
	assert.Zero(t, prices.Constant)
}

func TestComputeTierPricesKiroTokenTier(t *testing.T) {
	prices, err := ComputeTierPrices(kiroTierPriceExpr, "token", false, 1.85)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitToken, prices.Unit)
	assert.Equal(t, map[string]float64{"p": 3.7, "c": 18.5, "cr": 0.185, "cc": 4.625, "cc1h": 7.4}, prices.PerMillion)
	assert.Empty(t, prices.PerUnit)
}

func TestComputeTierPricesLongContextTiers(t *testing.T) {
	expression := `len <= 272000 ? tier("standard", p * 2.0 + c * 10.0 + cr * 0.1 + cc * 2.5 + cc12h * 2.5) : tier("long_context", p * 4.0 + c * 15.0 + cr * 0.2 + cc * 5.0 + cc12h * 5.0)`
	standard, err := ComputeTierPrices(expression, "standard", false, 1)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"p": 2, "c": 10, "cr": 0.1, "cc": 2.5, "cc12h": 2.5}, standard.PerMillion)

	long, err := ComputeTierPrices(expression, "long_context", false, 0.5)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitToken, long.Unit)
	assert.Equal(t, map[string]float64{"p": 2, "c": 7.5, "cr": 0.1, "cc": 2.5, "cc12h": 2.5}, long.PerMillion)
}

func TestComputeTierPricesSingleTier(t *testing.T) {
	prices, err := ComputeTierPrices(`v1:tier("base", p * 0.66 + c * 1.98 + cr * 0.022)`, "base", false, 1)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"p": 0.66, "c": 1.98, "cr": 0.022}, prices.PerMillion)
}

func TestComputeTierPricesTaskPerSecond(t *testing.T) {
	prices, err := ComputeTierPrices(`tier("base", u("seconds") * 0.03)`, "base", true, 1.2)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitTask, prices.Unit)
	assert.Equal(t, map[string]float64{"seconds": 0.036}, prices.PerUnit)
	assert.Zero(t, prices.Constant)
}

func TestComputeTierPricesTaskConstant(t *testing.T) {
	prices, err := ComputeTierPrices(`tier("base", 3)`, "base", true, 1.2)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitTask, prices.Unit)
	assert.Empty(t, prices.PerUnit)
	assert.Empty(t, prices.PerMillion)
	assert.Equal(t, 3.6, prices.Constant)
}

func TestComputeTierPricesTaskMixedUsageAndConstant(t *testing.T) {
	prices, err := ComputeTierPrices(`tier("base", u("seconds") + u("clips") * 10 + 2)`, "base", true, 1)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"seconds": 1, "clips": 10}, prices.PerUnit)
	assert.Equal(t, 2.0, prices.Constant)
}

func TestComputeTierPricesFixedImageTiers(t *testing.T) {
	expression := `(param("size") != nil && (param("size") in ["1K", "1k"]) ? tier("1K", fixed(0.054)) : tier("2K", fixed(0.072))) * image_count`
	oneK, err := ComputeTierPrices(expression, "1K", false, 1.2)
	require.NoError(t, err)
	assert.Equal(t, TierPriceUnitRequest, oneK.Unit)
	require.NotNil(t, oneK.Fixed)
	assert.Equal(t, 0.0648, *oneK.Fixed)

	twoK, err := ComputeTierPrices(expression, "2K", false, 1)
	require.NoError(t, err)
	require.NotNil(t, twoK.Fixed)
	assert.Equal(t, 0.072, *twoK.Fixed)
}

func TestComputeTierPricesIgnoresRequestRuleMultipliers(t *testing.T) {
	for _, expression := range []string{
		`(tier("base", p * 2 + c * 8)) * (param("service_tier") == "fast" ? 2 : 1) * (has(header("anthropic-beta"), "fast-mode-2026-02-01") ? 2.5 : 1)`,
		`(len <= 32000 ? tier("base", p * 2 + c * 8) : tier("long", p * 4 + c * 16)) * (param("fast") == true ? 2 : 1)`,
	} {
		prices, err := ComputeTierPrices(expression, "base", false, 1)
		require.NoError(t, err, expression)
		assert.Equal(t, map[string]float64{"p": 2, "c": 8}, prices.PerMillion, expression)
	}
}

func TestComputeTierPricesRejectsUnknownOrNonLinearTiers(t *testing.T) {
	cases := []struct {
		expression string
		tier       string
		taskUsage  bool
	}{
		{kiroTierPriceExpr, "missing", false},
		{kiroTierPriceExpr, "", false},
		{`tier("base", p * c)`, "base", false},
		{`tier("base", max(p, 100) * 2)`, "base", false},
		{`tier("base", p * (param("fast") == true ? 2 : 1))`, "base", false},
		{`tier("base", u("seconds") * u("clips"))`, "base", true},
		{`tier("base", p / c)`, "base", false},
		{`tier("base", fixed(0.1))`, "base", true},
		{`tier("broken",`, "broken", false},
	}
	for _, tc := range cases {
		prices, err := ComputeTierPrices(tc.expression, tc.tier, tc.taskUsage, 1)
		assert.Error(t, err, tc.expression)
		assert.Nil(t, prices, tc.expression)
	}
}

func TestComputeTierPricesMatchesSettlement(t *testing.T) {
	// The published per-credit price times the credits must equal the charge.
	snap := &BillingSnapshot{ExprString: kiroTierPriceExpr, ExprHash: ExprHashString(kiroTierPriceExpr), GroupRatio: 1.85, QuotaPerUnit: 500000, ExprVersion: 1}
	result, err := ComputeTieredQuotaWithRequest(snap, TokenParams{P: 100}, RequestInput{Usage: map[string]any{"provider": "kiro", "credits": 0.0442}})
	require.NoError(t, err)
	prices, err := ComputeTierPrices(kiroTierPriceExpr, result.MatchedTier, false, snap.GroupRatio)
	require.NoError(t, err)
	assert.InDelta(t, float64(result.ActualQuotaAfterGroup), 0.0442*prices.PerUnit["credits"]*500000, 1)
}

func TestComputeTierPricesKeepsZeroPricedVariables(t *testing.T) {
	prices, err := ComputeTierPrices(`tier("free", u("clips") * 0)`, "free", true, 1)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"clips": 0}, prices.PerUnit)

	tokens, err := ComputeTierPrices(`tier("base", p * 0 + c * 2)`, "base", false, 1)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"p": 0, "c": 2}, tokens.PerMillion)
}
