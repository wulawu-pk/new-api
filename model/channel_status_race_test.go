package model

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setChannelStatusWriteHook installs testHookBeforeChannelStatusWrite for one
// call: the first status write pauses in fn, later writes run normally.
func setChannelStatusWriteHook(t *testing.T, fn func(channelId int)) {
	t.Helper()
	var once sync.Once
	testHookBeforeChannelStatusWrite = func(channelId int) {
		once.Do(func() { fn(channelId) })
	}
	t.Cleanup(func() { testHookBeforeChannelStatusWrite = nil })
}

func insertStatusRaceChannel(t *testing.T, tag string, multiKey bool) *Channel {
	t.Helper()
	channel := &Channel{Name: t.Name(), Key: "key-a", Status: common.ChannelStatusEnabled, Models: "race-model", Group: "default", Tag: &tag}
	if multiKey {
		// key-b already failed, so a failure on key-a disables the channel.
		channel.Key = "key-a\nkey-b"
		channel.ChannelInfo = ChannelInfo{IsMultiKey: true, MultiKeySize: 2, MultiKeyStatusList: map[int]int{1: common.ChannelStatusAutoDisabled}}
	}
	require.NoError(t, channel.Insert())
	InitChannelCache()
	return channel
}

// waitForStoredStatus polls the database until the channel has status, so a
// concurrent writer that later blocks on a lock has already committed.
func waitForStoredStatus(t *testing.T, channelId int, status int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var stored Channel
		if err := DB.Select("status").First(&stored, channelId).Error; err == nil && stored.Status == status {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("channel #%d never reached status %d", channelId, status)
}

func assertChannelStatusEverywhere(t *testing.T, channelId int, status int, cacheEnabled bool) {
	t.Helper()
	stored, err := GetChannelById(channelId, true)
	require.NoError(t, err)
	assert.Equal(t, status, stored.Status, "database status")
	var abilities []Ability
	require.NoError(t, DB.Where("channel_id = ?", channelId).Find(&abilities).Error)
	require.NotEmpty(t, abilities)
	for _, ability := range abilities {
		assert.Equal(t, status == common.ChannelStatusEnabled, ability.Enabled, "ability enabled")
	}
	if cacheEnabled {
		cached, err := CacheGetChannel(channelId)
		require.NoError(t, err)
		assert.Equal(t, status, cached.Status, "cached status")
	}
}

// An automatic disable that read "enabled" before an administrator disabled
// the tag must not overwrite the manual disable when it writes afterwards.
func TestChannelStatusRaceTagDisableBeatsAutoDisable(t *testing.T) {
	for _, cacheEnabled := range []bool{false, true} {
		for _, multiKey := range []bool{false, true} {
			t.Run(fmt.Sprintf("cache=%t/multiKey=%t", cacheEnabled, multiKey), func(t *testing.T) {
				setupChannelStatusTest(t)
				common.MemoryCacheEnabled = cacheEnabled
				tag := "race-tag"
				channel := insertStatusRaceChannel(t, tag, multiKey)

				adminDone := make(chan error, 1)
				setChannelStatusWriteHook(t, func(int) {
					// Automatic disable has read the old status; the
					// administrator disables the tag now.
					go func() { adminDone <- DisableChannelByTag(tag) }()
					waitForStoredStatus(t, channel.Id, common.ChannelStatusManuallyDisabled)
				})

				changed := UpdateChannelStatus(channel.Id, "key-a", common.ChannelStatusAutoDisabled, "provider rejected key")
				assert.False(t, changed, "automatic disable must lose against the manual disable")
				select {
				case err := <-adminDone:
					require.NoError(t, err)
				case <-time.After(5 * time.Second):
					t.Fatal("tag disable did not finish")
				}

				assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusManuallyDisabled, cacheEnabled)
				stored, err := GetChannelById(channel.Id, true)
				require.NoError(t, err)
				assert.NotEqual(t, "provider rejected key", stored.GetOtherInfo()["status_reason"])
				if multiKey {
					assert.Equal(t, map[int]int{1: common.ChannelStatusAutoDisabled}, stored.ChannelInfo.MultiKeyStatusList)
				}
			})
		}
	}
}

// A manual status change made on another node between the automatic
// disable's read and write makes the automatic write fail.
func TestChannelStatusRaceManualUpdateBeatsAutoDisable(t *testing.T) {
	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache=%t", cacheEnabled), func(t *testing.T) {
			setupChannelStatusTest(t)
			common.MemoryCacheEnabled = cacheEnabled
			channel := insertStatusRaceChannel(t, "race-single", false)

			setChannelStatusWriteHook(t, func(id int) {
				// Same write an administrator's status update performs
				// on another node.
				require.NoError(t, DB.Model(&Channel{}).Where("id = ?", id).Update("status", common.ChannelStatusManuallyDisabled).Error)
				require.NoError(t, UpdateAbilityStatus(id, false))
			})

			changed := UpdateChannelStatus(channel.Id, "", common.ChannelStatusAutoDisabled, "provider rejected key")
			assert.False(t, changed)
			stored, err := GetChannelById(channel.Id, true)
			require.NoError(t, err)
			assert.Equal(t, common.ChannelStatusManuallyDisabled, stored.Status)
			var abilities []Ability
			require.NoError(t, DB.Where("channel_id = ?", channel.Id).Find(&abilities).Error)
			for _, ability := range abilities {
				assert.False(t, ability.Enabled)
			}
			if cacheEnabled {
				// The losing automatic write must not have touched the cache.
				cached, err := CacheGetChannel(channel.Id)
				require.NoError(t, err)
				assert.Equal(t, common.ChannelStatusEnabled, cached.Status)
			}
		})
	}
}

// An administrator's single-channel status update issued while an automatic
// disable is between its read and write ends as a manual disable.
func TestChannelStatusRaceConcurrentManualUpdateWins(t *testing.T) {
	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache=%t", cacheEnabled), func(t *testing.T) {
			setupChannelStatusTest(t)
			common.MemoryCacheEnabled = cacheEnabled
			channel := insertStatusRaceChannel(t, "race-concurrent", false)

			adminDone := make(chan bool, 1)
			setChannelStatusWriteHook(t, func(int) {
				go func() {
					adminDone <- UpdateChannelStatusManual(channel.Id, "", common.ChannelStatusManuallyDisabled, "manual operation")
				}()
				// Give the administrator's call time to reach the status lock.
				time.Sleep(50 * time.Millisecond)
			})

			UpdateChannelStatus(channel.Id, "", common.ChannelStatusAutoDisabled, "provider rejected key")
			select {
			case changed := <-adminDone:
				assert.True(t, changed)
			case <-time.After(5 * time.Second):
				t.Fatal("manual status update did not finish")
			}
			assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusManuallyDisabled, cacheEnabled)
		})
	}
}

// When an automatic change lands between the administrator's read and write,
// the administrator's update retries from a fresh read and still wins.
func TestChannelStatusRaceManualUpdateRetriesAfterConflict(t *testing.T) {
	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache=%t", cacheEnabled), func(t *testing.T) {
			setupChannelStatusTest(t)
			common.MemoryCacheEnabled = cacheEnabled
			channel := insertStatusRaceChannel(t, "race-retry", false)

			setChannelStatusWriteHook(t, func(id int) {
				require.NoError(t, DB.Model(&Channel{}).Where("id = ?", id).Update("status", common.ChannelStatusAutoDisabled).Error)
			})

			changed := UpdateChannelStatusManual(channel.Id, "", common.ChannelStatusManuallyDisabled, "manual operation")
			assert.True(t, changed)
			assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusManuallyDisabled, cacheEnabled)
			stored, err := GetChannelById(channel.Id, true)
			require.NoError(t, err)
			assert.Equal(t, "manual operation", stored.GetOtherInfo()["status_reason"])
		})
	}
}

// Without a concurrent change the automatic disable still applies, and the
// tag operations update database, abilities and cache.
func TestChannelStatusAutoDisableStillApplies(t *testing.T) {
	for _, cacheEnabled := range []bool{false, true} {
		for _, multiKey := range []bool{false, true} {
			t.Run(fmt.Sprintf("cache=%t/multiKey=%t", cacheEnabled, multiKey), func(t *testing.T) {
				setupChannelStatusTest(t)
				common.MemoryCacheEnabled = cacheEnabled
				tag := "race-normal"
				channel := insertStatusRaceChannel(t, tag, multiKey)

				changed := UpdateChannelStatus(channel.Id, "key-a", common.ChannelStatusAutoDisabled, "provider rejected key")
				assert.True(t, changed)
				assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusAutoDisabled, cacheEnabled)

				require.NoError(t, EnableChannelByTag(tag))
				assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusEnabled, cacheEnabled)
				require.NoError(t, DisableChannelByTag(tag))
				assertChannelStatusEverywhere(t, channel.Id, common.ChannelStatusManuallyDisabled, cacheEnabled)
			})
		}
	}
}
