package controller

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

// peroai: POST /api/token/ with a client_request_id creates at most one key
// per user and id within tokenCreateOnceTTL. A repeat (double click, retry
// after a lost response) gets the first result back instead of a second key.

const tokenCreateOnceTTL = 10 * time.Minute

var tokenClientRequestIdPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

type tokenCreateResult struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

func tokenCreateOnceKey(userId int, clientRequestId string) string {
	return fmt.Sprintf("token_create:%d:%s", userId, clientRequestId)
}

// tokenCreateLocks serialises requests with the same key inside this
// process, so the second of two concurrent requests waits for the first and
// replays its result.
var tokenCreateLocks = struct {
	sync.Mutex
	m map[string]*tokenCreateLock
}{m: map[string]*tokenCreateLock{}}

type tokenCreateLock struct {
	mu   sync.Mutex
	refs int
}

func lockTokenCreate(key string) func() {
	tokenCreateLocks.Lock()
	lock := tokenCreateLocks.m[key]
	if lock == nil {
		lock = &tokenCreateLock{}
		tokenCreateLocks.m[key] = lock
	}
	lock.refs++
	tokenCreateLocks.Unlock()
	lock.mu.Lock()
	return func() {
		lock.mu.Unlock()
		tokenCreateLocks.Lock()
		lock.refs--
		if lock.refs == 0 {
			delete(tokenCreateLocks.m, key)
		}
		tokenCreateLocks.Unlock()
	}
}

// tokenCreateMemory is the store when Redis is off.
var tokenCreateMemory = struct {
	sync.Mutex
	entries   map[string]tokenCreateMemoryEntry
	lastSweep time.Time
}{entries: map[string]tokenCreateMemoryEntry{}}

type tokenCreateMemoryEntry struct {
	result  *tokenCreateResult // nil while the create is running
	owner   string
	expires time.Time
}

var errTokenCreateInProgress = errors.New("token create in progress")

// reserveTokenCreate returns the stored result of an earlier create, or
// reserves the key for this request (owner) and returns nil. A key held by
// a create still running elsewhere returns errTokenCreateInProgress.
func reserveTokenCreate(key, owner string) (*tokenCreateResult, error) {
	if common.RedisEnabled {
		return reserveTokenCreateRedis(key, owner)
	}
	now := time.Now()
	tokenCreateMemory.Lock()
	defer tokenCreateMemory.Unlock()
	if now.Sub(tokenCreateMemory.lastSweep) > time.Minute {
		for k, entry := range tokenCreateMemory.entries {
			if now.After(entry.expires) {
				delete(tokenCreateMemory.entries, k)
			}
		}
		tokenCreateMemory.lastSweep = now
	}
	if entry, ok := tokenCreateMemory.entries[key]; ok && now.Before(entry.expires) {
		if entry.result != nil {
			result := *entry.result
			return &result, nil
		}
		return nil, errTokenCreateInProgress
	}
	tokenCreateMemory.entries[key] = tokenCreateMemoryEntry{owner: owner, expires: now.Add(tokenCreateOnceTTL)}
	return nil, nil
}

// finishTokenCreate stores the result of a successful create.
func finishTokenCreate(key string, result tokenCreateResult) error {
	if common.RedisEnabled {
		payload, err := common.Marshal(result)
		if err != nil {
			return err
		}
		return common.RDB.Set(context.Background(), key, string(payload), tokenCreateOnceTTL).Err()
	}
	tokenCreateMemory.Lock()
	defer tokenCreateMemory.Unlock()
	tokenCreateMemory.entries[key] = tokenCreateMemoryEntry{result: &result, expires: time.Now().Add(tokenCreateOnceTTL)}
	return nil
}

// releaseTokenCreate frees a reservation this request still holds, so a
// failed create can be retried with the same id.
func releaseTokenCreate(key, owner string) {
	if common.RedisEnabled {
		if err := tokenCreateReleaseScript.Run(context.Background(), common.RDB, []string{key}, tokenCreatePendingValue(owner)).Err(); err != nil && !errors.Is(err, redis.Nil) {
			common.SysLog(common.LogText("failed to release token create reservation: %s", err.Error()))
		}
		return
	}
	tokenCreateMemory.Lock()
	defer tokenCreateMemory.Unlock()
	if entry, ok := tokenCreateMemory.entries[key]; ok && entry.result == nil && entry.owner == owner {
		delete(tokenCreateMemory.entries, key)
	}
}

const tokenCreatePendingPrefix = "pending:"

func tokenCreatePendingValue(owner string) string {
	return tokenCreatePendingPrefix + owner
}

func isTokenCreatePending(value string) bool {
	return strings.HasPrefix(value, tokenCreatePendingPrefix)
}

const (
	tokenCreateWaitStep  = 100 * time.Millisecond
	tokenCreateWaitSteps = 30
)

var tokenCreateReleaseScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`)

func reserveTokenCreateRedis(key, owner string) (*tokenCreateResult, error) {
	ctx := context.Background()
	reserved, err := common.RDB.SetNX(ctx, key, tokenCreatePendingValue(owner), tokenCreateOnceTTL).Result()
	if err != nil {
		return nil, err
	}
	if reserved {
		return nil, nil
	}
	// Another instance holds the key: wait briefly for its result.
	value, err := common.RDB.Get(ctx, key).Result()
	for i := 0; err == nil && isTokenCreatePending(value) && i < tokenCreateWaitSteps; i++ {
		time.Sleep(tokenCreateWaitStep)
		value, err = common.RDB.Get(ctx, key).Result()
	}
	if errors.Is(err, redis.Nil) {
		// Expired or released between SETNX and GET: try once more.
		reserved, err = common.RDB.SetNX(ctx, key, tokenCreatePendingValue(owner), tokenCreateOnceTTL).Result()
		if err != nil {
			return nil, err
		}
		if reserved {
			return nil, nil
		}
		return nil, errTokenCreateInProgress
	}
	if err != nil {
		return nil, err
	}
	if isTokenCreatePending(value) {
		return nil, errTokenCreateInProgress
	}
	var result tokenCreateResult
	if err := common.UnmarshalJsonStr(value, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func respondTokenCreated(c *gin.Context, result tokenCreateResult) {
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"id":   result.Id,
			"name": result.Name,
		},
	})
}

// addTokenOnce runs create at most once for the user's clientRequestId.
// create writes its own error response and returns nil on failure.
func addTokenOnce(c *gin.Context, userId int, clientRequestId string, create func() *tokenCreateResult) {
	key := tokenCreateOnceKey(userId, clientRequestId)
	unlock := lockTokenCreate(key)
	defer unlock()

	owner := common.GetUUID()
	existing, err := reserveTokenCreate(key, owner)
	if errors.Is(err, errTokenCreateInProgress) {
		c.JSON(200, gin.H{
			"success": false,
			"code":    "token_create_in_progress",
			"message": i18n.T(c, i18n.MsgTokenCreateInProgress),
		})
		return
	}
	if err != nil {
		common.SysLog(common.LogText("failed to reserve token create: %s", err.Error()))
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	if existing != nil {
		params := tokenAuditParams(c)
		params["id"] = existing.Id
		params["name"] = existing.Name
		params["replayed"] = true
		common.SetContextKey(c, constant.ContextKeyTokenAuditSucceeded, true)
		respondTokenCreated(c, *existing)
		return
	}

	finished := false
	defer func() {
		if !finished {
			releaseTokenCreate(key, owner)
		}
	}()
	result := create()
	if result == nil {
		return
	}
	if err := finishTokenCreate(key, *result); err != nil {
		// The key exists; a later repeat may create a second one, which is
		// what happens without client_request_id too.
		common.SysLog(common.LogText("failed to store token create result: %s", err.Error()))
		releaseTokenCreate(key, owner)
	}
	finished = true
	respondTokenCreated(c, *result)
}
