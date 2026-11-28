package common

import (
	"slices"
	"strings"
	"sync"

	appcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
)

type ResponsesSanitizeAudit struct {
	mu                    sync.Mutex
	frames, items, fields []string
	truncated             bool
}

func NewResponsesSanitizeAudit() *ResponsesSanitizeAudit { return &ResponsesSanitizeAudit{} }
func auditName(name string) string {
	if len(name) == 0 || len(name) > 64 {
		return "?"
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '.') {
			return "?"
		}
	}
	return name
}
func (a *ResponsesSanitizeAudit) add(list *[]string, limit int, name string) {
	name = auditName(name)
	a.mu.Lock()
	defer a.mu.Unlock()
	if slices.Contains(*list, name) {
		return
	}
	if len(*list) >= limit {
		a.truncated = true
		return
	}
	*list = append(*list, strings.Clone(name))
}
func (a *ResponsesSanitizeAudit) AddDroppedFrame(name string) {
	if a != nil {
		a.add(&a.frames, 32, name)
	}
}
func (a *ResponsesSanitizeAudit) AddDroppedItemType(name string) {
	if a != nil {
		a.add(&a.items, 32, name)
	}
}
func (a *ResponsesSanitizeAudit) AddDroppedField(name string) {
	if a != nil {
		a.add(&a.fields, 64, name)
	}
}
func (a *ResponsesSanitizeAudit) Map() map[string]any {
	if a == nil {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.frames)+len(a.items)+len(a.fields) == 0 {
		return nil
	}
	m := map[string]any{}
	for key, list := range map[string][]string{"dropped_frames": a.frames, "dropped_item_types": a.items, "dropped_fields": a.fields} {
		if len(list) > 0 {
			m[key] = slices.Clone(list)
		}
	}
	if a.truncated {
		m["truncated"] = true
	}
	return m
}

var auditInitMu sync.Mutex

func GetResponsesSanitizeAudit(c *gin.Context) *ResponsesSanitizeAudit {
	if c == nil {
		return nil
	}
	auditInitMu.Lock()
	defer auditInitMu.Unlock()
	if a := PeekResponsesSanitizeAudit(c); a != nil {
		return a
	}
	a := NewResponsesSanitizeAudit()
	appcommon.SetContextKey(c, constant.ContextKeyResponsesSanitizeAudit, a)
	return a
}
func PeekResponsesSanitizeAudit(c *gin.Context) *ResponsesSanitizeAudit {
	if c == nil {
		return nil
	}
	a, _ := appcommon.GetContextKeyType[*ResponsesSanitizeAudit](c, constant.ContextKeyResponsesSanitizeAudit)
	return a
}
