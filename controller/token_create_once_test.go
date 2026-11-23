package controller

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type tokenCreateResponse struct {
	Success bool              `json:"success"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Data    tokenCreateResult `json:"data"`
}

func resetTokenCreateMemory(t *testing.T) {
	t.Helper()
	clear := func() {
		tokenCreateMemory.Lock()
		tokenCreateMemory.entries = map[string]tokenCreateMemoryEntry{}
		tokenCreateMemory.Unlock()
	}
	clear()
	t.Cleanup(clear)
}

func setupTokenCreateOnceTest(t *testing.T, useRedis bool) *gorm.DB {
	t.Helper()
	db := setupTokenControllerTestDB(t)
	resetTokenCreateMemory(t)
	previousRedis, previousClient := common.RedisEnabled, common.RDB
	t.Cleanup(func() { common.RedisEnabled, common.RDB = previousRedis, previousClient })
	common.RedisEnabled = false
	if useRedis {
		server := miniredis.RunT(t)
		common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
		require.NoError(t, common.RDB.Ping(context.Background()).Err())
		common.RedisEnabled = true
	}
	return db
}

func createTokenForTest(t *testing.T, userID int, body map[string]any) tokenCreateResponse {
	t.Helper()
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/", body, userID)
	AddToken(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response tokenCreateResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func tokenCreateBody(clientRequestId string) map[string]any {
	body := map[string]any{"name": "once", "expired_time": -1, "unlimited_quota": true, "group": "default"}
	if clientRequestId != "" {
		body["client_request_id"] = clientRequestId
	}
	return body
}

func countUserTokens(t *testing.T, db *gorm.DB, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, db.Model(&model.Token{}).Where("user_id = ?", userID).Count(&count).Error)
	return count
}

func TestAddTokenClientRequestIdCreatesOnce(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		t.Run(fmt.Sprintf("redis=%v", useRedis), func(t *testing.T) {
			db := setupTokenCreateOnceTest(t, useRedis)

			first := createTokenForTest(t, 1, tokenCreateBody("req-AbC_123"))
			require.True(t, first.Success, first.Message)
			require.NotZero(t, first.Data.Id)
			second := createTokenForTest(t, 1, tokenCreateBody("req-AbC_123"))
			require.True(t, second.Success, second.Message)
			assert.Equal(t, first.Data, second.Data)
			assert.EqualValues(t, 1, countUserTokens(t, db, 1))

			if useRedis {
				ttl := common.RDB.TTL(context.Background(), tokenCreateOnceKey(1, "req-AbC_123")).Val()
				assert.Positive(t, ttl)
				assert.LessOrEqual(t, ttl, tokenCreateOnceTTL)
			}

			// Another id creates another key.
			third := createTokenForTest(t, 1, tokenCreateBody("req-other-1"))
			require.True(t, third.Success, third.Message)
			assert.NotEqual(t, first.Data.Id, third.Data.Id)
			assert.EqualValues(t, 2, countUserTokens(t, db, 1))
		})
	}
}

func TestAddTokenClientRequestIdIsPerUser(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		t.Run(fmt.Sprintf("redis=%v", useRedis), func(t *testing.T) {
			db := setupTokenCreateOnceTest(t, useRedis)
			mine := createTokenForTest(t, 1, tokenCreateBody("shared-request-id"))
			theirs := createTokenForTest(t, 2, tokenCreateBody("shared-request-id"))
			require.True(t, mine.Success, mine.Message)
			require.True(t, theirs.Success, theirs.Message)
			assert.NotEqual(t, mine.Data.Id, theirs.Data.Id)
			assert.EqualValues(t, 1, countUserTokens(t, db, 1))
			assert.EqualValues(t, 1, countUserTokens(t, db, 2))
		})
	}
}

func TestAddTokenRejectsMalformedClientRequestId(t *testing.T) {
	db := setupTokenCreateOnceTest(t, false)
	for _, id := range []any{"short", "has space in it", "bad/slash/chars", "x" + string(make([]byte, 64)), "ümlaut-chars", 12345678} {
		body := tokenCreateBody("")
		body["client_request_id"] = id
		response := createTokenForTest(t, 1, body)
		assert.False(t, response.Success, "%v", id)
	}
	tooLong := make([]byte, 65)
	for i := range tooLong {
		tooLong[i] = 'a'
	}
	response := createTokenForTest(t, 1, tokenCreateBody(string(tooLong)))
	assert.False(t, response.Success)
	assert.Equal(t, "Invalid parameters", response.Message)
	assert.EqualValues(t, 0, countUserTokens(t, db, 1))
}

func TestAddTokenWithoutClientRequestIdUnchanged(t *testing.T) {
	db := setupTokenCreateOnceTest(t, false)
	for range 2 {
		response := createTokenForTest(t, 1, tokenCreateBody(""))
		require.True(t, response.Success, response.Message)
		assert.NotZero(t, response.Data.Id)
	}
	assert.EqualValues(t, 2, countUserTokens(t, db, 1))
}

// A failed create releases the reservation, so a retry with the same id
// creates the key.
func TestAddTokenClientRequestIdFailureAllowsRetry(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		t.Run(fmt.Sprintf("redis=%v", useRedis), func(t *testing.T) {
			db := setupTokenCreateOnceTest(t, useRedis)
			body := tokenCreateBody("retry-after-fail")
			body["group"] = "ghost"
			failed := createTokenForTest(t, 1, body)
			require.False(t, failed.Success)

			retried := createTokenForTest(t, 1, tokenCreateBody("retry-after-fail"))
			require.True(t, retried.Success, retried.Message)
			assert.EqualValues(t, 1, countUserTokens(t, db, 1))
		})
	}
}

// Two identical requests at once (memory mode) create one key; both get its id.
func TestAddTokenClientRequestIdConcurrentCreatesOnce(t *testing.T) {
	db := setupTokenCreateOnceTest(t, false)
	const workers = 2
	start := make(chan struct{})
	results := make([]tokenCreateResponse, workers)
	var wg sync.WaitGroup
	for i := range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			results[i] = createTokenForTest(t, 1, tokenCreateBody("concurrent-req-01"))
		}()
	}
	close(start)
	wg.Wait()
	for _, result := range results {
		require.True(t, result.Success, result.Message)
	}
	assert.Equal(t, results[0].Data, results[1].Data)
	assert.EqualValues(t, 1, countUserTokens(t, db, 1))
}

// With Redis, a duplicate that finds another instance's create still
// running waits for its result instead of creating a second key.
func TestAddTokenClientRequestIdRedisWaitsForPendingCreate(t *testing.T) {
	db := setupTokenCreateOnceTest(t, true)
	key := tokenCreateOnceKey(1, "pending-elsewhere")
	require.NoError(t, common.RDB.Set(context.Background(), key, tokenCreatePendingValue("other-instance"), tokenCreateOnceTTL).Err())
	go func() {
		time.Sleep(3 * tokenCreateWaitStep)
		_ = finishTokenCreate(key, tokenCreateResult{Id: 4242, Name: "made-elsewhere"})
	}()
	response := createTokenForTest(t, 1, tokenCreateBody("pending-elsewhere"))
	require.True(t, response.Success, response.Message)
	assert.Equal(t, tokenCreateResult{Id: 4242, Name: "made-elsewhere"}, response.Data)
	assert.EqualValues(t, 0, countUserTokens(t, db, 1))
}
