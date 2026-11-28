package service

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestResponsesSanitizeAuditAdminOnly(t *testing.T) {
	for _, tc := range []struct {
		name  string
		limit int
		key   string
		add   func(*relaycommon.ResponsesSanitizeAudit, string)
	}{{"frames", 32, "dropped_frames", (*relaycommon.ResponsesSanitizeAudit).AddDroppedFrame}, {"items", 32, "dropped_item_types", (*relaycommon.ResponsesSanitizeAudit).AddDroppedItemType}, {"fields", 64, "dropped_fields", (*relaycommon.ResponsesSanitizeAudit).AddDroppedField}} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}}
			get := func() string { return GenerateTextOtherInfo(c, info, 1, 1, 1, 0, 1, 0, 1).JSONString() }
			require.NotContains(t, get(), "responses_sanitize")
			require.Nil(t, relaycommon.PeekResponsesSanitizeAudit(c))
			a := relaycommon.GetResponsesSanitizeAudit(c)
			require.Same(t, a, relaycommon.GetResponsesSanitizeAudit(c))
			require.Nil(t, a.Map())
			tc.add(a, "first")
			tc.add(a, "first")
			tc.add(a, "bad sensitive text")
			tc.add(a, strings.Repeat("a", 65))
			for i := 0; i < tc.limit; i++ {
				tc.add(a, fmt.Sprint(i))
			}
			raw := get()
			require.Equal(t, 1, strings.Count(raw, "responses_sanitize"))
			require.NotContains(t, raw, "sensitive")
			obj := gjson.Get(raw, "admin_info.responses_sanitize")
			require.True(t, obj.Get("truncated").Bool())
			names := obj.Get(tc.key).Array()
			require.Len(t, names, tc.limit)
			require.Equal(t, "first", names[0].String())
			require.Equal(t, "?", names[1].String())
			require.Equal(t, "0", names[2].String())
		})
	}
}
