package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withCryptoRateServer(t *testing.T, body string, status int) *atomic.Int32 {
	t.Helper()
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	oldURL, oldNow := cryptoRateURL, cryptoRateNow
	cryptoRateURL = server.URL
	cryptoRateMu.Lock()
	cryptoRateCache = map[string]cachedCryptoRate{}
	cryptoRateMu.Unlock()
	t.Cleanup(func() {
		server.Close()
		cryptoRateURL, cryptoRateNow = oldURL, oldNow
		cryptoRateMu.Lock()
		cryptoRateCache = map[string]cachedCryptoRate{}
		cryptoRateMu.Unlock()
	})
	return &hits
}

func TestCryptoCoinOf(t *testing.T) {
	assert.Equal(t, "usdt", cryptoCoinOf("usdt.trc20"))
	assert.Equal(t, "usdc", cryptoCoinOf("USDC.solana"))
	assert.Equal(t, "", cryptoCoinOf("alipay"))
	assert.Equal(t, "", cryptoCoinOf("trx.trc20"))
}

func TestQuoteCryptoUsdTopupCreditsLiveRate(t *testing.T) {
	withCryptoRateServer(t, `{"tether":{"cny":6.67}}`, http.StatusOK)
	oldPrice, oldQPU := operation_setting.Price, common.QuotaPerUnit
	operation_setting.Price = 1
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { operation_setting.Price, common.QuotaPerUnit = oldPrice, oldQPU })

	q, err := quoteCryptoUsdTopup(context.Background(), 1, "usdt.trc20", "default")
	require.NoError(t, err)
	assert.Equal(t, "usdt", q.Coin)
	assert.Equal(t, int64(1), q.Coins)
	assert.Equal(t, "6.67", q.Rate.String())
	// 1 USDT x 6.67 CNY / Price 1 = $6.67 = 3,335,000 quota
	assert.Equal(t, 3_335_000, q.CreditQuota)

	q, err = quoteCryptoUsdTopup(context.Background(), 3, "usdt.bep20", "default")
	require.NoError(t, err)
	assert.Equal(t, 10_005_000, q.CreditQuota)
}

func TestCryptoRateCacheAndStaleFallback(t *testing.T) {
	hits := withCryptoRateServer(t, `{"usd-coin":{"cny":6.5}}`, http.StatusOK)
	now := time.Unix(1_700_000_000, 0)
	cryptoRateNow = func() time.Time { return now }

	rate, err := cryptoCNYRate(context.Background(), "usdc")
	require.NoError(t, err)
	assert.Equal(t, "6.5", rate.String())
	_, _ = cryptoCNYRate(context.Background(), "usdc")
	assert.Equal(t, int32(1), hits.Load(), "second call within a minute is cached")

	// The quote source breaks: a recent rate is still used, an old one is not.
	cryptoRateURL = "http://127.0.0.1:1"
	now = now.Add(5 * time.Minute)
	rate, err = cryptoCNYRate(context.Background(), "usdc")
	require.NoError(t, err)
	assert.Equal(t, "6.5", rate.String())

	now = now.Add(time.Hour)
	_, err = cryptoCNYRate(context.Background(), "usdc")
	require.Error(t, err)
}

func TestCryptoRateRejectsImplausibleQuote(t *testing.T) {
	withCryptoRateServer(t, `{"tether":{"cny":0.99}}`, http.StatusOK)
	_, err := cryptoCNYRate(context.Background(), "usdt")
	require.Error(t, err)
}
