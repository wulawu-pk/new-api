package controller

// peroai: coin-priced crypto top-ups through the epay (BEpusdt) slot.
//
// Stock new-api treats the amount a customer enters as quota dollars and asks
// the gateway for amount x Price in CNY, so "1" on the wallet page costs about
// 0.15 USDT. With payment_setting.crypto_usd_topup on, a usdt.* / usdc.* order
// is priced in whole coins instead: the customer enters N, BEpusdt is told
// fiat=USD rate=1 so the checkout asks for exactly N coins, and the order
// credits N x (live CNY per coin) / Price quota dollars, fixed when the order
// is created. That keeps crypto in line with the 卡密 rate of ¥1 = $1.

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

const (
	cryptoRateFreshFor = time.Minute
	cryptoRateStaleMax = 30 * time.Minute
	// CNY per coin outside this band is treated as a bad quote, not a price.
	cryptoRateMin = 3.0
	cryptoRateMax = 15.0
)

var cryptoCoinGeckoIDs = map[string]string{
	"usdt": "tether",
	"usdc": "usd-coin",
}

// cryptoRateURL is a variable so tests can point it at a local server.
var cryptoRateURL = "https://api.coingecko.com/api/v3/simple/price"

type cachedCryptoRate struct {
	rate decimal.Decimal
	at   time.Time
}

var (
	cryptoRateMu    sync.Mutex
	cryptoRateCache = map[string]cachedCryptoRate{}
	cryptoRateNow   = time.Now
)

// cryptoCoinOf returns "usdt" or "usdc" for a coin-priced epay method, or "".
func cryptoCoinOf(paymentMethod string) string {
	coin, _, ok := strings.Cut(strings.ToLower(paymentMethod), ".")
	if !ok {
		return ""
	}
	if _, known := cryptoCoinGeckoIDs[coin]; !known {
		return ""
	}
	return coin
}

func isCryptoUsdTopupEnabled() bool {
	return operation_setting.GetPaymentSetting().CryptoUsdTopup &&
		operation_setting.GetQuotaDisplayType() != operation_setting.QuotaDisplayTypeTokens
}

func isCryptoUsdMethod(paymentMethod string) bool {
	return isCryptoUsdTopupEnabled() && cryptoCoinOf(paymentMethod) != ""
}

// cryptoCNYRate returns the CNY price of one coin from CoinGecko, the source
// BEpusdt itself syncs from, cached for a minute.
func cryptoCNYRate(ctx context.Context, coin string) (decimal.Decimal, error) {
	id, ok := cryptoCoinGeckoIDs[coin]
	if !ok {
		return decimal.Zero, fmt.Errorf("unsupported coin %q", coin)
	}
	cryptoRateMu.Lock()
	defer cryptoRateMu.Unlock()

	now := cryptoRateNow()
	cached, hasCached := cryptoRateCache[coin]
	if hasCached && now.Sub(cached.at) < cryptoRateFreshFor {
		return cached.rate, nil
	}
	rate, err := fetchCryptoCNYRate(ctx, id)
	if err == nil {
		cryptoRateCache[coin] = cachedCryptoRate{rate: rate, at: now}
		return rate, nil
	}
	if hasCached && now.Sub(cached.at) < cryptoRateStaleMax {
		logger.LogWarn(ctx, common.LogText("crypto top-up rate refresh failed, using cached rate coin=%s age=%s error=%q", coin, now.Sub(cached.at).Round(time.Second), err.Error()))
		return cached.rate, nil
	}
	return decimal.Zero, err
}

func fetchCryptoCNYRate(ctx context.Context, id string) (decimal.Decimal, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	query := url.Values{"ids": {id}, "vs_currencies": {"cny"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cryptoRateURL+"?"+query.Encode(), nil)
	if err != nil {
		return decimal.Zero, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return decimal.Zero, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return decimal.Zero, err
	}
	if resp.StatusCode != http.StatusOK {
		return decimal.Zero, fmt.Errorf("coingecko status %d", resp.StatusCode)
	}
	var parsed map[string]map[string]float64
	if err := common.Unmarshal(body, &parsed); err != nil {
		return decimal.Zero, err
	}
	value, ok := parsed[id]["cny"]
	if !ok || value < cryptoRateMin || value > cryptoRateMax {
		return decimal.Zero, fmt.Errorf("coingecko returned no usable cny rate for %s", id)
	}
	return decimal.NewFromFloat(value), nil
}

type cryptoUsdQuote struct {
	Coin        string
	Coins       int64
	Rate        decimal.Decimal
	CreditQuota int
}

// quoteCryptoUsdTopup prices `coins` whole coins for a user group.
// Credited quota dollars = coins x CNY rate / (Price x top-up group ratio).
func quoteCryptoUsdTopup(ctx context.Context, coins int64, paymentMethod string, group string) (cryptoUsdQuote, error) {
	coin := cryptoCoinOf(paymentMethod)
	rate, err := cryptoCNYRate(ctx, coin)
	if err != nil {
		logger.LogError(ctx, common.LogText("crypto top-up rate unavailable coin=%s error=%q", coin, err.Error()))
		return cryptoUsdQuote{}, common.NewMessage("Exchange rate is temporarily unavailable, please try again later")
	}
	price := decimal.NewFromFloat(operation_setting.Price)
	groupRatio := decimal.NewFromFloat(common.GetTopupGroupRatio(group))
	if groupRatio.LessThanOrEqual(decimal.Zero) {
		groupRatio = decimal.NewFromInt(1)
	}
	if price.LessThanOrEqual(decimal.Zero) {
		return cryptoUsdQuote{}, common.NewMessage("Payment information has not been configured by administrator")
	}
	quota := decimal.NewFromInt(coins).
		Mul(rate).
		Div(price.Mul(groupRatio)).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit)).
		Floor()
	creditQuota, err := validateCreditedQuota(quota)
	if err != nil {
		return cryptoUsdQuote{}, err
	}
	return cryptoUsdQuote{Coin: coin, Coins: coins, Rate: rate, CreditQuota: creditQuota}, nil
}

func cryptoQuoteResponse(q cryptoUsdQuote) gin.H {
	return gin.H{
		"message":      "success",
		"data":         strconv.FormatInt(q.Coins, 10),
		"currency":     strings.ToUpper(q.Coin),
		"rate":         q.Rate.String(),
		"credit_quota": q.CreditQuota,
	}
}

// requestCryptoUsdAmount answers /api/user/amount for a coin-priced method.
func requestCryptoUsdAmount(c *gin.Context, userId int, req AmountRequest) {
	group, err := model.GetUserGroup(userId, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}
	q, err := quoteCryptoUsdTopup(c.Request.Context(), req.Amount, req.PaymentMethod, group)
	if err != nil {
		paymentError(c, err)
		return
	}
	c.JSON(http.StatusOK, cryptoQuoteResponse(q))
}

// requestCryptoUsdEpay creates a coin-priced BEpusdt order. The caller has
// already checked the minimum and the method.
func requestCryptoUsdEpay(c *gin.Context, userId int, req EpayRequest) {
	group, err := model.GetUserGroup(userId, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}
	q, err := quoteCryptoUsdTopup(c.Request.Context(), req.Amount, req.PaymentMethod, group)
	if err != nil {
		paymentError(c, err)
		return
	}
	if err := model.ValidateTopUpQuotaCapacity(userId, q.CreditQuota); err != nil {
		paymentError(c, err)
		return
	}
	if operation_setting.PayAddress == "" || operation_setting.EpayId == "" || operation_setting.EpayKey == "" {
		paymentError(c, common.NewMessage("Payment information has not been configured by administrator"))
		return
	}

	returnUrl := paymentReturnPath("/usage-logs")
	notifyUrl := service.GetCallbackAddress() + "/api/user/epay/notify"
	tradeNo := fmt.Sprintf("USR%dNO%s%d", userId, common.GetRandomString(6), time.Now().Unix())
	money := strconv.FormatInt(q.Coins, 10)

	// go-epay's Purchase has no slot for BEpusdt's fiat/rate extensions, so the
	// request is signed here with the same helper Purchase uses.
	params, err := epay.GenerateParamsWithError(map[string]string{
		"pid":          operation_setting.EpayId,
		"type":         req.PaymentMethod,
		"out_trade_no": tradeNo,
		"notify_url":   notifyUrl,
		"return_url":   returnUrl,
		"name":         fmt.Sprintf("TUC%d", req.Amount),
		"money":        money,
		"device":       string(epay.PC),
		"fiat":         "USD",
		"rate":         "1",
		"sign_type":    "MD5",
		"sign":         "",
	}, operation_setting.EpayKey)
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("Epay crypto top-up failed to sign user_id=%d trade_no=%s error=%q", userId, tradeNo, err.Error()))
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	submitUrl, err := url.JoinPath(operation_setting.PayAddress, epay.PurchaseUrl)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}

	topUp := &model.TopUp{
		UserId:          userId,
		Amount:          int64(q.CreditQuota) / int64(common.QuotaPerUnit),
		Money:           float64(q.Coins),
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
		CreditQuota:     int64(q.CreditQuota),
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("Epay crypto top-up failed to create order user_id=%d trade_no=%s error=%q", userId, tradeNo, err.Error()))
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}
	logger.LogInfo(c.Request.Context(), common.LogText("Epay crypto top-up order created user_id=%d trade_no=%s payment_method=%s coins=%d cny_rate=%s credit_quota=%d", userId, tradeNo, req.PaymentMethod, q.Coins, q.Rate.String(), q.CreditQuota))
	resp := cryptoQuoteResponse(q)
	resp["data"] = params
	resp["url"] = submitUrl
	c.JSON(http.StatusOK, resp)
}
