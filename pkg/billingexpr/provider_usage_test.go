package billingexpr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const kiroCreditExpr = `u("provider") == "kiro" ? tier("credit", u("credits") * 0.25 * 1000000) : tier("token", p * 2 + c * 10 + cr * 0.1)`

func TestKiroCreditExprCompilesAndRuns(t *testing.T) {
	_, err := CompileFromCache(kiroCreditExpr)
	require.NoError(t, err)
	assert.False(t, UsesFixedPricing(kiroCreditExpr))

	cost, trace, err := RunExprWithRequest(kiroCreditExpr, TokenParams{P: 709, C: 236}, RequestInput{
		Usage: map[string]any{"provider": "kiro", "credits": 0.0382},
	})
	require.NoError(t, err)
	assert.Equal(t, "credit", trace.MatchedTier)
	assert.InDelta(t, 9550.0, cost, 1e-6)

	cost, trace, err = RunExprWithRequest(kiroCreditExpr, TokenParams{P: 1000, C: 100}, RequestInput{})
	require.NoError(t, err)
	assert.Equal(t, "token", trace.MatchedTier)
	assert.InDelta(t, 3000.0, cost, 1e-6)
}

func TestKiroCreditExprHasVariantCompiles(t *testing.T) {
	expression := `has(u("provider"), "kiro") ? tier("credit", u("credits") * 250000) : tier("token", p * 2 + c * 10)`
	cost, trace, err := RunExprWithRequest(expression, TokenParams{}, RequestInput{
		Usage: map[string]any{"provider": "kiro", "credits": 0.0442},
	})
	require.NoError(t, err)
	assert.Equal(t, "credit", trace.MatchedTier)
	assert.InDelta(t, 11050.0, cost, 1e-6)
}

func TestFixedRejectsUsageDrivenAmount(t *testing.T) {
	// fixed() requires a numeric literal, so per-credit pricing must scale the
	// token-unit output instead.
	_, err := CompileFromCache(`u("provider") == "kiro" ? tier("credit", fixed(u("credits") * 0.25)) : tier("token", p * 2)`)
	require.Error(t, err)
}

func TestUsesOnlyProviderUsage(t *testing.T) {
	assert.True(t, UsesOnlyProviderUsage(kiroCreditExpr))
	assert.True(t, UsesOnlyProviderUsage(`v1:u("context_usage_percentage") > 50 ? tier("a", p) : tier("b", p)`))
	assert.False(t, UsesOnlyProviderUsage(`tier("base", p * 2)`))
	assert.False(t, UsesOnlyProviderUsage(`tier("base", u("seconds") * 0.4)`))
	assert.False(t, UsesOnlyProviderUsage(`tier("base", u("credits") + u("seconds"))`))
	assert.False(t, UsesOnlyProviderUsage(`tier("base", u(header("k")) == nil ? p : c)`))
	assert.False(t, UsesOnlyProviderUsage(`tier(`))
}
