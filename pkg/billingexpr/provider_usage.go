package billingexpr

import (
	"strings"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

// peroai fork: provider-reported usage facts for ordinary text relays.
//
// Some upstreams bill per provider unit rather than per token and report the
// charge in the response body, e.g. a kiro relay returns
//
//	"provider_usage": {"provider": "kiro", "credits": 0.0442, "context_usage_percentage": 1.2}
//
// The Claude handlers copy those facts onto RelayInfo.ProviderUsage and
// service.TryTieredSettle merges them into RequestInput.Usage, so a model
// expression can read them with u("credits") / u("provider").
//
// Upstream only fills RequestInput.Usage for task billing, so it rejects u()
// in text-relay expressions. ProviderUsageKeys is the narrow allow-list that
// text relays may read; any other key still requires a task plugin schema.
// Facts are absent at pre-consume time, so an expression must branch on them,
// e.g. u("provider") == "kiro" ? tier("credit", u("credits") * 250000) : tier("token", ...).
var ProviderUsageKeys = map[string]bool{
	"provider":                 true,
	"credits":                  true,
	"context_usage_percentage": true,
}

// UsesOnlyProviderUsage reports whether an expression calls u() and every
// call uses a literal key from ProviderUsageKeys. Dynamic keys, other keys and
// expressions without u() return false.
func UsesOnlyProviderUsage(exprStr string) bool {
	_, body := ParseExprVersion(exprStr)
	tree, err := parser.Parse(body)
	if err != nil {
		return false
	}
	found := false
	other := ast.Find(tree.Node, func(node ast.Node) bool {
		call, ok := node.(*ast.CallNode)
		if !ok {
			return false
		}
		callee, ok := call.Callee.(*ast.IdentifierNode)
		if !ok || callee.Value != "u" {
			return false
		}
		found = true
		if len(call.Arguments) != 1 {
			return true
		}
		literal, ok := call.Arguments[0].(*ast.StringNode)
		return !ok || !ProviderUsageKeys[strings.TrimSpace(literal.Value)]
	}) != nil
	return found && !other
}
