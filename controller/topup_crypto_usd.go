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
//
// The signed gateway request never leaves the server: new-api posts it to
// BEpusdt at EPAY_INTERNAL_SUBMIT_URL itself and hands the browser only the
// checkout URL. Without that address no coin-priced order is created. BEpusdt starts the 30-minute
// payment window when it receives the request, so the locked credit and the
// payment window start together and a customer cannot hold signed parameters
// back until the rate moves in their favour.

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"os"
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
	"golang.org/x/sync/singleflight"
)

const (
	cryptoRateFreshFor = time.Minute
	cryptoRateStaleMax = 30 * time.Minute
	// After a failed refresh, CoinGecko is not asked again for this long; a
	// cached rate younger than cryptoRateStaleMax is used meanwhile.
	cryptoRateRetryAfter   = 30 * time.Second
	cryptoRateFetchTimeout = 8 * time.Second
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
	// cryptoRateMu guards cryptoRateCache and cryptoRateFailedAt only; it is
	// never held across a network call.
	cryptoRateMu       sync.Mutex
	cryptoRateCache    = map[string]cachedCryptoRate{}
	cryptoRateFailedAt = map[string]time.Time{}
	// cryptoRateGroup merges concurrent refreshes of the same coin.
	cryptoRateGroup singleflight.Group
	cryptoRateNow   = time.Now
)

var errCryptoRateBackoff = errors.New("rate source failed recently, waiting before the next try")

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
// BEpusdt itself syncs from, cached for a minute. Concurrent refreshes of a
// coin share one request, a failed refresh backs off for
// cryptoRateRetryAfter, and a caller stops waiting when its ctx ends.
func cryptoCNYRate(ctx context.Context, coin string) (decimal.Decimal, error) {
	id, ok := cryptoCoinGeckoIDs[coin]
	if !ok {
		return decimal.Zero, fmt.Errorf("unsupported coin %q", coin)
	}

	now := cryptoRateNow()
	cryptoRateMu.Lock()
	cached, hasCached := cryptoRateCache[coin]
	failedAt := cryptoRateFailedAt[coin]
	cryptoRateMu.Unlock()

	if hasCached && now.Sub(cached.at) < cryptoRateFreshFor {
		return cached.rate, nil
	}
	staleUsable := hasCached && now.Sub(cached.at) < cryptoRateStaleMax
	if !failedAt.IsZero() && now.Sub(failedAt) < cryptoRateRetryAfter {
		if staleUsable {
			return cached.rate, nil
		}
		return decimal.Zero, errCryptoRateBackoff
	}

	results := cryptoRateGroup.DoChan(coin, func() (any, error) {
		// Detached from the first caller: its cancellation must not fail the
		// other callers sharing this refresh. fetchCryptoCNYRate bounds it.
		rate, err := fetchCryptoCNYRate(context.WithoutCancel(ctx), id)
		cryptoRateMu.Lock()
		defer cryptoRateMu.Unlock()
		if err != nil {
			cryptoRateFailedAt[coin] = cryptoRateNow()
			return nil, err
		}
		cryptoRateCache[coin] = cachedCryptoRate{rate: rate, at: cryptoRateNow()}
		delete(cryptoRateFailedAt, coin)
		return rate, nil
	})

	select {
	case <-ctx.Done():
		return decimal.Zero, ctx.Err()
	case res := <-results:
		if res.Err == nil {
			return res.Val.(decimal.Decimal), nil
		}
		if staleUsable {
			logger.LogWarn(ctx, common.LogText("crypto top-up rate refresh failed, using cached rate coin=%s age=%s error=%q", coin, now.Sub(cached.at).Round(time.Second), res.Err.Error()))
			return cached.rate, nil
		}
		return decimal.Zero, res.Err
	}
}

func fetchCryptoCNYRate(ctx context.Context, id string) (decimal.Decimal, error) {
	ctx, cancel := context.WithTimeout(ctx, cryptoRateFetchTimeout)
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
	group, err := cryptoUserGroup(userId)
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

// cryptoUserGroup is a variable so tests can skip the user-group lookup.
var cryptoUserGroup = func(userId int) (string, error) {
	return model.GetUserGroup(userId, true)
}

// cryptoEpaySubmitClient posts signed orders to BEpusdt. It must not follow
// redirects: the 302 Location is the checkout URL handed to the browser.
var cryptoEpaySubmitClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

const cryptoCheckoutPathPrefix = "/pay/checkout/"

// cryptoSubmitOutcome tells whether BEpusdt may hold an order new-api did not
// get a checkout URL for.
type cryptoSubmitOutcome int

const (
	// cryptoSubmitRejected: BEpusdt answered normally and did not accept the
	// order (HTTP 200 with an error text, 4xx, or a redirect that is not a
	// checkout page on PayAddress). Nobody can pay it.
	cryptoSubmitRejected cryptoSubmitOutcome = iota
	// cryptoSubmitUnknown: no usable answer (connection error, timeout, 5xx,
	// unreadable response). BEpusdt may have created the order, so the local
	// order stays pending and a later paid callback still credits it.
	cryptoSubmitUnknown
)

// cryptoSubmitError carries only an HTTP status and a short category, never
// the gateway's own text, so it is safe to log.
type cryptoSubmitError struct {
	outcome  cryptoSubmitOutcome
	status   int
	category string
}

func (e *cryptoSubmitError) Error() string {
	return fmt.Sprintf("gateway submit %s status=%d", e.category, e.status)
}

// cryptoInternalSubmitURL is BEpusdt's submit.php as new-api reaches it over
// the internal network, e.g. http://bepusdt:8080/submit.php.
func cryptoInternalSubmitURL() string {
	return strings.TrimSpace(os.Getenv("EPAY_INTERNAL_SUBMIT_URL"))
}

// submitCryptoEpayOrder posts the signed order to BEpusdt and returns the
// checkout URL from its 302. BEpusdt answers a rejected order with HTTP 200
// and an error text. Errors are *cryptoSubmitError.
func submitCryptoEpayOrder(ctx context.Context, submitURL string, params map[string]string) (string, error) {
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, submitURL, strings.NewReader(form.Encode()))
	if err != nil {
		// Nothing was sent.
		return "", &cryptoSubmitError{outcome: cryptoSubmitRejected, category: "bad_request"}
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := cryptoEpaySubmitClient.Do(req)
	if err != nil {
		category := "network_error"
		var netErr interface{ Timeout() bool }
		if errors.As(err, &netErr) && netErr.Timeout() {
			category = "timeout"
		}
		return "", &cryptoSubmitError{outcome: cryptoSubmitUnknown, category: category}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusInternalServerError {
		return "", &cryptoSubmitError{outcome: cryptoSubmitUnknown, status: resp.StatusCode, category: "server_error"}
	}
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusSeeOther {
		// The body is read only to tell a complete answer from a broken one;
		// its text is not kept.
		if _, err := io.Copy(io.Discard, io.LimitReader(resp.Body, 2<<10)); err != nil {
			return "", &cryptoSubmitError{outcome: cryptoSubmitUnknown, status: resp.StatusCode, category: "read_error"}
		}
		return "", &cryptoSubmitError{outcome: cryptoSubmitRejected, status: resp.StatusCode, category: "refused"}
	}
	location := resp.Header.Get("Location")
	if err := validateCryptoCheckoutURL(location); err != nil {
		return "", &cryptoSubmitError{outcome: cryptoSubmitRejected, status: resp.StatusCode, category: "bad_checkout_location"}
	}
	return location, nil
}

// validateCryptoCheckoutURL accepts only an https checkout page on the same
// origin as PayAddress.
func validateCryptoCheckoutURL(raw string) error {
	checkout, err := url.Parse(raw)
	if err != nil || !checkout.IsAbs() {
		return fmt.Errorf("checkout location %q is not an absolute URL", raw)
	}
	payAddress, err := url.Parse(operation_setting.PayAddress)
	if err != nil {
		return fmt.Errorf("pay address is not a URL")
	}
	if checkout.Scheme != "https" || checkout.User != nil ||
		!strings.EqualFold(checkout.Scheme, payAddress.Scheme) ||
		!strings.EqualFold(checkout.Host, payAddress.Host) ||
		!strings.HasPrefix(checkout.Path, cryptoCheckoutPathPrefix) ||
		len(checkout.Path) == len(cryptoCheckoutPathPrefix) {
		return fmt.Errorf("checkout location %q is not a checkout page on the pay address", raw)
	}
	return nil
}

// requestCryptoUsdEpay creates a coin-priced BEpusdt order. The caller has
// already checked the minimum and the method.
func requestCryptoUsdEpay(c *gin.Context, userId int, req EpayRequest) {
	// Without the internal address the signed order would have to go through
	// the browser, which can hold it back until the rate moves. Refuse.
	internalSubmitURL := cryptoInternalSubmitURL()
	if internalSubmitURL == "" {
		logger.LogError(c.Request.Context(), "EPAY_INTERNAL_SUBMIT_URL is not set: coin-priced crypto orders are refused")
		paymentError(c, common.NewMessage("Payment is temporarily unavailable"))
		return
	}
	if u, parseErr := url.Parse(internalSubmitURL); parseErr != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		logger.LogError(c.Request.Context(), "EPAY_INTERNAL_SUBMIT_URL is not an http(s) URL: coin-priced crypto orders are refused")
		paymentError(c, common.NewMessage("Payment is temporarily unavailable"))
		return
	}
	group, err := cryptoUserGroup(userId)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}
	q, err := quoteCryptoUsdTopup(c.Request.Context(), req.Amount, req.PaymentMethod, group)
	if err != nil {
		paymentError(c, err)
		return
	}
	// The customer confirmed a quote; if the rate moved since, create no
	// order and let them confirm the new one.
	if req.ExpectedCreditQuota > 0 && req.ExpectedCreditQuota != int64(q.CreditQuota) {
		resp := cryptoQuoteResponse(q)
		maps.Copy(resp, gin.H{"message": "error", "data": "The exchange rate has been updated. Please review and confirm again.", "quote_changed": true})
		maps.Copy(resp, common.NewMessage("The exchange rate has been updated. Please review and confirm again.").Fields())
		c.JSON(http.StatusOK, resp)
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

	// See RequestEpay: /payment-return drops the gateway's signed query.
	returnUrl := paymentReturnPath("/payment-return")
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
	// The local order is written before BEpusdt hears of it, so a gateway
	// callback can always find it. If the gateway then refuses the order,
	// the local row is marked failed; the browser never saw the signed
	// parameters, so nobody can pay it. If the outcome is unknown, the row
	// stays pending so a paid callback can still credit it.
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

	// Detached from the browser request: an aborted page must not leave
	// BEpusdt with an order that new-api then marks failed halfway.
	checkoutURL, err := submitCryptoEpayOrder(context.WithoutCancel(c.Request.Context()), internalSubmitURL, params)
	if err != nil {
		submitErr := &cryptoSubmitError{outcome: cryptoSubmitUnknown, category: "unknown"}
		errors.As(err, &submitErr)
		if submitErr.outcome == cryptoSubmitUnknown {
			logger.LogWarn(c.Request.Context(), common.LogText("Epay crypto top-up gateway result unknown, order kept pending user_id=%d trade_no=%s status=%d category=%s", userId, tradeNo, submitErr.status, submitErr.category))
			resp := gin.H{"message": "error", "data": "The payment gateway did not respond. Your order has been kept; check your top-up history later or place a new order.", "order_status": common.TopUpStatusPending, "trade_no": tradeNo}
			maps.Copy(resp, common.NewMessage("The payment gateway did not respond. Your order has been kept; check your top-up history later or place a new order.").Fields())
			c.JSON(http.StatusOK, resp)
			return
		}
		logger.LogError(c.Request.Context(), common.LogText("Epay crypto top-up gateway refused the order user_id=%d trade_no=%s status=%d category=%s", userId, tradeNo, submitErr.status, submitErr.category))
		if markErr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderEpay, common.TopUpStatusFailed); markErr != nil {
			logger.LogError(c.Request.Context(), common.LogText("Epay crypto top-up failed to mark order failed trade_no=%s error=%q", tradeNo, markErr.Error()))
		}
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	resp := cryptoQuoteResponse(q)
	resp["data"] = gin.H{"checkout_url": checkoutURL}
	resp["url"] = checkoutURL
	c.JSON(http.StatusOK, resp)
}
