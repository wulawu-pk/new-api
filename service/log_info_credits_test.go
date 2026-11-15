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
