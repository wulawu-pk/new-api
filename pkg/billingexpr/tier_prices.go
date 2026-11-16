package billingexpr

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

// Tier price units published on usage logs.
const (
	TierPriceUnitToken   = "token"
	TierPriceUnitRequest = "request"
	TierPriceUnitCredit  = "credit"
	TierPriceUnitTask    = "task"
	TierPriceUnitUsage   = "usage"
)

// tierPriceTokenVars are the token dimensions a tier body may price.
var tierPriceTokenVars = []string{"p", "c", "cr", "cc", "cc1h", "cc12h", "img", "img_cr", "img_o", "ai", "ao"}

// TierPrices is the customer-facing price table of one matched tier, in USD
// after the group ratio. It lets usage logs show unit prices without
// publishing the billing expression itself.
//
//   - PerMillion: USD per 1M tokens for each token variable (p, c, cr, ...).
//   - PerUnit: USD per unit of each usage fact read with u("key"), for example
//     {"credits": 0.25} or {"seconds": 0.036}.
//   - Fixed: USD per request (or per image when the log has image_count) of a
//     fixed(N) tier.
//   - Constant: USD charged per request on top of the variable part.
//
// Request-rule multipliers outside the tier are not included.
type TierPrices struct {
	Unit       string             `json:"unit"`
	PerMillion map[string]float64 `json:"per_million,omitempty"`
	PerUnit    map[string]float64 `json:"per_unit,omitempty"`
	Fixed      *float64           `json:"fixed,omitempty"`
	Constant   float64            `json:"constant,omitempty"`
}

// ComputeTierPrices reads the unit prices of the tier named matchedTier from a
// billing expression and multiplies them by groupRatio. taskUsage selects the
// task conversion (expression output is USD) instead of the v1 convention
// (expression output is USD × 1e6).
//
// It returns an error instead of guessing when the tier cannot be found or
// its body is not a linear combination of token variables and literal u()
// facts; callers then publish no unit price.
func ComputeTierPrices(exprStr, matchedTier string, taskUsage bool, groupRatio float64) (*TierPrices, error) {
	matchedTier = strings.TrimSpace(matchedTier)
	if matchedTier == "" {
		return nil, fmt.Errorf("matched tier is empty")
	}
	if math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) || groupRatio < 0 {
		return nil, fmt.Errorf("invalid group ratio %v", groupRatio)
	}
	_, body := ParseExprVersion(exprStr)
	tree, err := parser.Parse(body)
	if err != nil {
		return nil, fmt.Errorf("parse billing expression: %w", err)
	}
	tierBody := findTierBody(tree.Node, matchedTier)
	if tierBody == nil {
		return nil, fmt.Errorf("tier %q not found", matchedTier)
	}

	// fixed(N) tiers: the price is the literal itself.
	if call, ok := tierBody.(*ast.CallNode); ok {
		if callee, direct := call.Callee.(*ast.IdentifierNode); direct && callee.Value == "fixed" {
			if taskUsage {
				return nil, fmt.Errorf("fixed pricing is not supported for task usage expressions")
			}
			if len(call.Arguments) != 1 {
				return nil, fmt.Errorf("fixed() takes one argument")
			}
			amount, literal := requestRuleNumber(call.Arguments[0])
			if !literal || amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
				return nil, fmt.Errorf("fixed price must be a non-negative numeric literal")
			}
			fixed := roundTierPrice(amount * groupRatio)
			return &TierPrices{Unit: TierPriceUnitRequest, Fixed: &fixed}, nil
		}
	}

	usageKeys := make([]string, 0)
	seen := make(map[string]bool)
	if err := collectLinearBodyVars(tierBody, &usageKeys, seen); err != nil {
		return nil, err
	}
	vars := make([]string, 0, len(tierPriceTokenVars)+len(usageKeys))
	vars = append(vars, tierPriceTokenVars...)
	for _, key := range usageKeys {
		vars = append(vars, usageVarName(key))
	}

	constant, coefficients, err := linearCoefficients(tierBody, vars)
	if err != nil {
		return nil, err
	}

	// v1: expression output / 1e6 = USD. Task usage: expression output = USD.
	toUSD := 1.0 / 1_000_000
	tokenToPerMillion := 1.0
	if taskUsage {
		toUSD = 1
		tokenToPerMillion = 1_000_000
	}

	prices := &TierPrices{}
	// Every variable the body names is listed, a zero price included, so a
	// free dimension reads "$0" instead of disappearing.
	for _, name := range tierPriceTokenVars {
		if !seen[name] {
			continue
		}
		if prices.PerMillion == nil {
			prices.PerMillion = make(map[string]float64)
		}
		prices.PerMillion[name] = roundTierPrice(coefficients[name] * tokenToPerMillion * groupRatio)
	}
	for _, key := range usageKeys {
		if prices.PerUnit == nil {
			prices.PerUnit = make(map[string]float64)
		}
		prices.PerUnit[key] = roundTierPrice(coefficients[usageVarName(key)] * toUSD * groupRatio)
	}
	if constant != 0 {
		prices.Constant = roundTierPrice(constant * toUSD * groupRatio)
	}

	switch {
	case taskUsage:
		prices.Unit = TierPriceUnitTask
	case hasCreditPrice(prices.PerUnit) && len(prices.PerMillion) == 0:
		prices.Unit = TierPriceUnitCredit
	case len(prices.PerMillion) > 0:
		prices.Unit = TierPriceUnitToken
	case len(prices.PerUnit) > 0:
		prices.Unit = TierPriceUnitUsage
	default:
		prices.Unit = TierPriceUnitRequest
	}
	return prices, nil
}

func hasCreditPrice(perUnit map[string]float64) bool {
	_, ok := perUnit["credits"]
	return ok
}

func usageVarName(key string) string {
	return "u:" + key
}

// findTierBody returns the price argument of the first tier(name, body) call
// whose literal name equals matchedTier, in source order.
func findTierBody(node ast.Node, matchedTier string) ast.Node {
	var found ast.Node
	var visit func(ast.Node)
	visit = func(n ast.Node) {
		if found != nil || n == nil {
			return
		}
		if call, ok := n.(*ast.CallNode); ok {
			if callee, direct := call.Callee.(*ast.IdentifierNode); direct && callee.Value == "tier" && len(call.Arguments) == 2 {
				if name, literal := call.Arguments[0].(*ast.StringNode); literal && strings.TrimSpace(name.Value) == matchedTier {
					found = call.Arguments[1]
					return
				}
			}
		}
		for _, child := range astChildren(n) {
			visit(child)
		}
	}
	visit(node)
	return found
}

func astChildren(node ast.Node) []ast.Node {
	switch n := node.(type) {
	case *ast.UnaryNode:
		return []ast.Node{n.Node}
	case *ast.BinaryNode:
		return []ast.Node{n.Left, n.Right}
	case *ast.ConditionalNode:
		return []ast.Node{n.Cond, n.Exp1, n.Exp2}
	case *ast.CallNode:
		return append([]ast.Node{n.Callee}, n.Arguments...)
	case *ast.BuiltinNode:
		return n.Arguments
	case *ast.SequenceNode:
		return n.Nodes
	case *ast.ChainNode:
		return []ast.Node{n.Node}
	case *ast.MemberNode:
		return []ast.Node{n.Node, n.Property}
	case *ast.ArrayNode:
		return n.Nodes
	case *ast.PredicateNode:
		return []ast.Node{n.Node}
	case *ast.VariableDeclaratorNode:
		return []ast.Node{n.Value, n.Expr}
	default:
		return nil
	}
}

// collectLinearBodyVars accepts only numbers, token variables, literal u()
// calls and + - * / operators. It marks the token variables it meets in seen
// and records the u() keys in source order.
func collectLinearBodyVars(node ast.Node, usageKeys *[]string, seen map[string]bool) error {
	switch n := node.(type) {
	case *ast.IntegerNode, *ast.FloatNode:
		return nil
	case *ast.IdentifierNode:
		for _, name := range tierPriceTokenVars {
			if n.Value == name {
				seen[name] = true
				return nil
			}
		}
		return fmt.Errorf("identifier %q is not a priced variable", n.Value)
	case *ast.CallNode:
		key, ok := literalUsageKey(n)
		if !ok {
			return fmt.Errorf("call %s is not a literal u() fact", n.String())
		}
		if !seen[usageVarName(key)] {
			seen[usageVarName(key)] = true
			*usageKeys = append(*usageKeys, key)
		}
		return nil
	case *ast.UnaryNode:
		if n.Operator != "-" && n.Operator != "+" {
			return fmt.Errorf("unary operator %q is not linear", n.Operator)
		}
		return collectLinearBodyVars(n.Node, usageKeys, seen)
	case *ast.BinaryNode:
		switch n.Operator {
		case "+", "-", "*", "/":
		default:
			return fmt.Errorf("operator %q is not linear", n.Operator)
		}
		if err := collectLinearBodyVars(n.Left, usageKeys, seen); err != nil {
			return err
		}
		return collectLinearBodyVars(n.Right, usageKeys, seen)
	default:
		return fmt.Errorf("unsupported node %T in tier body", node)
	}
}

func literalUsageKey(call *ast.CallNode) (string, bool) {
	callee, ok := call.Callee.(*ast.IdentifierNode)
	if !ok || callee.Value != "u" || len(call.Arguments) != 1 {
		return "", false
	}
	literal, ok := call.Arguments[0].(*ast.StringNode)
	if !ok {
		return "", false
	}
	key := strings.TrimSpace(literal.Value)
	return key, key != ""
}

func evalLinearBody(node ast.Node, env map[string]float64) (float64, error) {
	switch n := node.(type) {
	case *ast.IntegerNode:
		return float64(n.Value), nil
	case *ast.FloatNode:
		return n.Value, nil
	case *ast.IdentifierNode:
		return env[n.Value], nil
	case *ast.CallNode:
		key, ok := literalUsageKey(n)
		if !ok {
			return 0, fmt.Errorf("unsupported call %s", n.String())
		}
		return env[usageVarName(key)], nil
	case *ast.UnaryNode:
		value, err := evalLinearBody(n.Node, env)
		if err != nil {
			return 0, err
		}
		if n.Operator == "-" {
			return -value, nil
		}
		return value, nil
	case *ast.BinaryNode:
		left, err := evalLinearBody(n.Left, env)
		if err != nil {
			return 0, err
		}
		right, err := evalLinearBody(n.Right, env)
		if err != nil {
			return 0, err
		}
		switch n.Operator {
		case "+":
			return left + right, nil
		case "-":
			return left - right, nil
		case "*":
			return left * right, nil
		case "/":
			if right == 0 {
				return 0, fmt.Errorf("division by zero")
			}
			return left / right, nil
		}
	}
	return 0, fmt.Errorf("unsupported node %T in tier body", node)
}

// linearCoefficients evaluates the body with each variable set to 1 (others
// 0) and then checks the result with all variables set at once at distinct
// values, which rejects products of variables such as p * c.
func linearCoefficients(body ast.Node, vars []string) (float64, map[string]float64, error) {
	env := make(map[string]float64, len(vars))
	constant, err := evalLinearBody(body, env)
	if err != nil {
		return 0, nil, err
	}
	coefficients := make(map[string]float64, len(vars))
	for _, name := range vars {
		env[name] = 1
		value, err := evalLinearBody(body, env)
		env[name] = 0
		if err != nil {
			return 0, nil, err
		}
		coefficients[name] = value - constant
	}

	expected := constant
	for i, name := range vars {
		weight := float64(i + 2)
		env[name] = weight
		expected += coefficients[name] * weight
	}
	actual, err := evalLinearBody(body, env)
	if err != nil {
		return 0, nil, err
	}
	scale := math.Max(1, math.Max(math.Abs(expected), math.Abs(actual)))
	if math.IsNaN(actual) || math.IsInf(actual, 0) || math.Abs(actual-expected) > 1e-9*scale {
		return 0, nil, fmt.Errorf("tier body is not linear")
	}
	return constant, coefficients, nil
}

// roundTierPrice trims binary floating-point noise (0.24999999999999997 →
// 0.25) while keeping 12 significant digits.
func roundTierPrice(value float64) float64 {
	rounded, err := strconv.ParseFloat(strconv.FormatFloat(value, 'g', 12, 64), 64)
	if err != nil {
		return value
	}
	return rounded
}
