package controller

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetCryptoRateState() {
	cryptoRateMu.Lock()
	cryptoRateCache = map[string]cachedCryptoRate{}
	cryptoRateFailedAt = map[string]time.Time{}
	cryptoRateMu.Unlock()
}

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
	resetCryptoRateState()
	t.Cleanup(func() {
		server.Close()
		cryptoRateURL, cryptoRateNow = oldURL, oldNow
		resetCryptoRateState()
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

func TestCryptoRateFailureBacksOff(t *testing.T) {
	hits := withCryptoRateServer(t, `oops`, http.StatusServiceUnavailable)
	now := time.Unix(1_700_000_000, 0)
	cryptoRateNow = func() time.Time { return now }
	cryptoRateMu.Lock()
	cryptoRateCache["usdt"] = cachedCryptoRate{rate: decimal.RequireFromString("6.6"), at: now.Add(-5 * time.Minute)}
	cryptoRateMu.Unlock()

	for range 3 {
		rate, err := cryptoCNYRate(context.Background(), "usdt")
		require.NoError(t, err)
		assert.Equal(t, "6.6", rate.String())
	}
	assert.Equal(t, int32(1), hits.Load(), "a failed refresh is not retried inside the back-off window")

	now = now.Add(cryptoRateRetryAfter + time.Second)
	_, _ = cryptoCNYRate(context.Background(), "usdt")
	assert.Equal(t, int32(2), hits.Load(), "the source is asked again after the back-off")

	// Without a usable cached rate the back-off answers with an error at once.
	cryptoRateMu.Lock()
	delete(cryptoRateCache, "usdt")
	cryptoRateMu.Unlock()
	_, err := cryptoCNYRate(context.Background(), "usdt")
	require.Error(t, err)
	assert.Equal(t, int32(2), hits.Load())
}

func TestCryptoRateRefreshIsSharedAndCancellable(t *testing.T) {
	release := make(chan struct{})
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		<-release
		_, _ = w.Write([]byte(`{"tether":{"cny":6.7}}`))
	}))
	oldURL := cryptoRateURL
	cryptoRateURL = server.URL
	resetCryptoRateState()
	t.Cleanup(func() {
		server.Close()
		cryptoRateURL = oldURL
		resetCryptoRateState()
	})
	cryptoRateMu.Lock()
	cryptoRateCache["usdc"] = cachedCryptoRate{rate: decimal.RequireFromString("6.5"), at: time.Now()}
	cryptoRateMu.Unlock()

	var wg sync.WaitGroup
	rates := make([]string, 5)
	for i := range rates {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rate, err := cryptoCNYRate(context.Background(), "usdt")
			if err == nil {
				rates[i] = rate.String()
			}
		}()
	}
	require.Eventually(t, func() bool { return hits.Load() == 1 }, 2*time.Second, 5*time.Millisecond)

	// A fresh coin is not blocked by the other coin's refresh.
	start := time.Now()
	rate, err := cryptoCNYRate(context.Background(), "usdc")
	require.NoError(t, err)
	assert.Equal(t, "6.5", rate.String())
	assert.Less(t, time.Since(start), time.Second)

	// A waiter whose request is gone returns instead of waiting.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = cryptoCNYRate(ctx, "usdt")
	require.ErrorIs(t, err, context.Canceled)

	close(release)
	wg.Wait()
	assert.Equal(t, int32(1), hits.Load(), "concurrent refreshes share one request")
	for _, r := range rates {
		assert.Equal(t, "6.7", r)
	}
}

type cryptoEpayFixture struct {
	db       *gorm.DB
	gateway  *httptest.Server
	received chan url.Values
}

// setupCryptoEpay wires settings, an in-memory database and a fake BEpusdt
// whose submit.php answers with `respond`.
func setupCryptoEpay(t *testing.T, respond func(w http.ResponseWriter)) *cryptoEpayFixture {
	t.Helper()
	withCryptoRateServer(t, `{"tether":{"cny":6.67}}`, http.StatusOK)

	ps := operation_setting.GetPaymentSetting()
	gs := operation_setting.GetGeneralSetting()
	oldTopup, oldDisplay := ps.CryptoUsdTopup, gs.QuotaDisplayType
	oldPrice, oldQPU, oldMin := operation_setting.Price, common.QuotaPerUnit, operation_setting.MinTopUp
	oldAddr, oldId, oldKey, oldMethods := operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey, operation_setting.PayMethods
	oldGroup, oldDB := cryptoUserGroup, model.DB
	oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()

	ps.CryptoUsdTopup = true
	gs.QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.Price, common.QuotaPerUnit, operation_setting.MinTopUp = 1, 500000, 1
	operation_setting.PayAddress = "https://peroai.cc"
	operation_setting.EpayId, operation_setting.EpayKey = "1000", "test-key"
	operation_setting.PayMethods = []map[string]string{{"name": "USDT", "type": "usdt.trc20"}}
	cryptoUserGroup = func(int) (string, error) { return "default", nil }

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}))
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.Create(&model.User{Id: 7, Username: "buyer", Status: common.UserStatusEnabled}).Error)

	f := &cryptoEpayFixture{db: db, received: make(chan url.Values, 4)}
	f.gateway = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.received <- r.PostForm
		respond(w)
	}))
	t.Setenv("EPAY_INTERNAL_SUBMIT_URL", f.gateway.URL+"/submit.php")

	t.Cleanup(func() {
		f.gateway.Close()
		ps.CryptoUsdTopup, gs.QuotaDisplayType = oldTopup, oldDisplay
		operation_setting.Price, common.QuotaPerUnit, operation_setting.MinTopUp = oldPrice, oldQPU, oldMin
		operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey, operation_setting.PayMethods = oldAddr, oldId, oldKey, oldMethods
		cryptoUserGroup, model.DB = oldGroup, oldDB
		common.SetDatabaseTypes(oldMain, oldLog)
		if sqlDB, dbErr := db.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})
	return f
}

func callCryptoPay(t *testing.T, body string) map[string]any {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 7)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	RequestEpay(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	var resp map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.NotContains(t, recorder.Body.String(), `"sign"`, "signed gateway parameters never reach the browser")
	return resp
}

func onlyTopUp(t *testing.T, db *gorm.DB) model.TopUp {
	t.Helper()
	var topUps []model.TopUp
	require.NoError(t, db.Find(&topUps).Error)
	require.Len(t, topUps, 1)
	return topUps[0]
}

func TestCryptoEpaySubmitsServerSideAndReturnsCheckout(t *testing.T) {
	f := setupCryptoEpay(t, func(w http.ResponseWriter) {
		w.Header().Set("Location", "https://peroai.cc/pay/checkout/T123")
		w.WriteHeader(http.StatusFound)
	})

	resp := callCryptoPay(t, `{"amount":1,"payment_method":"usdt.trc20"}`)
	assert.Equal(t, "success", resp["message"])
	assert.Equal(t, "https://peroai.cc/pay/checkout/T123", resp["url"])
	assert.Equal(t, map[string]any{"checkout_url": "https://peroai.cc/pay/checkout/T123"}, resp["data"])
	assert.Equal(t, "USDT", resp["currency"])
	assert.Equal(t, "6.67", resp["rate"])
	assert.EqualValues(t, 3_335_000, resp["credit_quota"])

	form := <-f.received
	assert.Equal(t, "1", form.Get("money"))
	assert.Equal(t, "USD", form.Get("fiat"))
	assert.NotEmpty(t, form.Get("sign"))
	topUp := onlyTopUp(t, f.db)
	assert.Equal(t, form.Get("out_trade_no"), topUp.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, int64(3_335_000), topUp.CreditQuota)
}

func TestCryptoEpayGatewayErrorFailsOrder(t *testing.T) {
	f := setupCryptoEpay(t, func(w http.ResponseWriter) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("签名错误"))
	})

	resp := callCryptoPay(t, `{"amount":1,"payment_method":"usdt.trc20"}`)
	assert.Equal(t, "error", resp["message"])
	assert.Equal(t, "Failed to start payment", resp["data"])
	assert.Nil(t, resp["url"])
	assert.Equal(t, common.TopUpStatusFailed, onlyTopUp(t, f.db).Status)
}

func TestCryptoEpayRejectsForeignCheckoutLocation(t *testing.T) {
	for _, location := range []string{
		"https://evil.example/pay/checkout/T1",
		"http://peroai.cc/pay/checkout/T1",
		"https://peroai.cc/somewhere/else",
		"/pay/checkout/T1",
	} {
		t.Run(location, func(t *testing.T) {
			f := setupCryptoEpay(t, func(w http.ResponseWriter) {
				w.Header().Set("Location", location)
				w.WriteHeader(http.StatusFound)
			})
			resp := callCryptoPay(t, `{"amount":1,"payment_method":"usdt.trc20"}`)
			assert.Equal(t, "error", resp["message"])
			assert.Equal(t, "Failed to start payment", resp["data"])
			assert.Equal(t, common.TopUpStatusFailed, onlyTopUp(t, f.db).Status)
		})
	}
}

func TestCryptoEpayRefusesChangedQuote(t *testing.T) {
	f := setupCryptoEpay(t, func(w http.ResponseWriter) {
		w.Header().Set("Location", "https://peroai.cc/pay/checkout/T1")
		w.WriteHeader(http.StatusFound)
	})

	resp := callCryptoPay(t, `{"amount":1,"payment_method":"usdt.trc20","expected_credit_quota":3000000}`)
	assert.Equal(t, "error", resp["message"])
	assert.Equal(t, true, resp["quote_changed"])
	assert.EqualValues(t, 3_335_000, resp["credit_quota"])
	assert.Len(t, f.received, 0, "no gateway order for a quote the customer did not confirm")
	var count int64
	require.NoError(t, f.db.Model(&model.TopUp{}).Count(&count).Error)
	assert.Zero(t, count)

	resp = callCryptoPay(t, `{"amount":1,"payment_method":"usdt.trc20","expected_credit_quota":3335000}`)
	assert.Equal(t, "success", resp["message"])
}

func TestCryptoAmountRejectsDisabledMethodBeforeRate(t *testing.T) {
	hits := withCryptoRateServer(t, `{"tether":{"cny":6.67}}`, http.StatusOK)
	ps := operation_setting.GetPaymentSetting()
	gs := operation_setting.GetGeneralSetting()
	oldTopup, oldDisplay, oldMethods, oldMin := ps.CryptoUsdTopup, gs.QuotaDisplayType, operation_setting.PayMethods, operation_setting.MinTopUp
	ps.CryptoUsdTopup, gs.QuotaDisplayType = true, operation_setting.QuotaDisplayTypeUSD
	operation_setting.PayMethods = []map[string]string{{"name": "USDT", "type": "usdt.trc20"}}
	operation_setting.MinTopUp = 2
	t.Cleanup(func() {
		ps.CryptoUsdTopup, gs.QuotaDisplayType, operation_setting.PayMethods, operation_setting.MinTopUp = oldTopup, oldDisplay, oldMethods, oldMin
	})

	for _, body := range []string{
		`{"amount":5,"payment_method":"usdc.trc20"}`,
		`{"amount":1,"payment_method":"usdt.trc20"}`,
	} {
		gin.SetMode(gin.TestMode)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 7)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/amount", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		RequestAmount(ctx)
		assert.Contains(t, recorder.Body.String(), `"message":"error"`, fmt.Sprintf("body %s", body))
	}
	assert.Equal(t, int32(0), hits.Load(), "no rate request for a disabled method or a too-small amount")
}
