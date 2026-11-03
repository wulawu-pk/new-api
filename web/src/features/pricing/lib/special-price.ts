/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import { compileBillingExpression } from './billing-expression/parser'
import type { ExpressionNode } from './billing-expression/types'
import type { PricingModel } from '../types'

// ----------------------------------------------------------------------------
// Shop-window summary for expressions the price table cannot expand
// ----------------------------------------------------------------------------
// The model square is a shop window. Some expressions use upstream usage facts
// (credits) or request parameters (image size), so the standard tier parser
// cannot turn them into per-token rows and the old UI fell back to printing the
// raw source. That is a debugging view, not a price.
//
// This helper derives the two things a customer can act on:
//   1. a per-unit price when the expression prices a countable unit
//      (one upstream credit, one image size, one call), and
//   2. otherwise a single plain-language line about the billing basis.
//
// The raw expression stays available in the model details drawer.

export type SpecialPriceRow = {
  key: string
  /** English source string; the caller runs it through t(). */
  label: string
  value: string
}

export type SpecialPriceSummary = {
  rows: SpecialPriceRow[]
  /** English source string explaining the basis when rows is empty. */
  note: string
}

const MEG = 1_000_000

function numberLiteral(node: ExpressionNode): number | null {
  return node.kind === 'literal' && typeof node.value === 'number'
    ? node.value
    : null
}

function collectTierCalls(
  node: ExpressionNode
): { label: string; body: ExpressionNode }[] {
  const tiers: { label: string; body: ExpressionNode }[] = []
  const walk = (current: ExpressionNode) => {
    if (
      current.kind === 'call' &&
      current.name === 'tier' &&
      current.args.length === 2 &&
      current.args[0].kind === 'literal' &&
      typeof current.args[0].value === 'string'
    ) {
      tiers.push({ label: current.args[0].value, body: current.args[1] })
    }
    if (current.kind === 'call') current.args.forEach(walk)
    if (current.kind === 'unary') walk(current.operand)
    if (current.kind === 'binary') {
      walk(current.left)
      walk(current.right)
    }
    if (current.kind === 'conditional') {
      walk(current.condition)
      walk(current.yes)
      walk(current.no)
    }
  }
  walk(node)
  return tiers
}

function fixedPrice(body: ExpressionNode): number | null {
  if (body.kind === 'call' && body.name === 'fixed' && body.args.length === 1) {
    return numberLiteral(body.args[0])
  }
  return null
}

/**
 * Read `tier("<label>", fixed(<price>))` pairs straight out of the source text.
 *
 * The web parser rejects a few operators the backend accepts (for example
 * `param("size") in [...]`), so image expressions often fail to compile even
 * though their tier prices are perfectly readable. A textual scan recovers the
 * numbers a customer needs when the grammar cannot.
 */
export function readFixedTiersFromSource(
  expression: string
): { label: string; price: number }[] {
  const found: { label: string; price: number }[] = []
  const pattern = /tier\(\s*"([^"]+)"\s*,\s*fixed\(\s*([0-9.]+)\s*\)\s*\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(expression)) !== null) {
    const price = Number(match[2])
    if (Number.isFinite(price) && price > 0) {
      found.push({ label: match[1], price })
    }
  }
  return found
}

/**
 * Price of one credit from `u("credits") * <rate> * 1e6`
 * (or the equivalent order). Returns null when the shape is not that.
 */
export function readCreditUnitPrice(body: ExpressionNode): number | null {
  const small: number[] = []
  let sawCredits = false
  const walk = (node: ExpressionNode) => {
    if (node.kind === 'variable') return
    if (node.kind === 'call') {
      if (node.name === 'u') {
        const key = node.args[0]
        if (key?.kind === 'literal' && key.value === 'credits') sawCredits = true
        return
      }
      node.args.forEach(walk)
      return
    }
    if (node.kind === 'binary' && node.operator === '*') {
      walk(node.left)
      walk(node.right)
      const left = numberLiteral(node.left)
      const right = numberLiteral(node.right)
      for (const value of [left, right]) {
        if (value !== null && value > 0 && value < MEG / 10) small.push(value)
      }
      return
    }
    if (node.kind === 'literal') {
      const value = numberLiteral(node)
      if (value !== null && value > 0 && value < MEG / 10) small.push(value)
    }
  }
  walk(body)
  if (!sawCredits) return null
  const unique = [...new Set(small)]
  return unique.length === 1 ? unique[0] : null
}

function formatMoney(priceUSD: number, showSymbol = true): string {
  return formatBillingCurrencyFromUSD(priceUSD, {
    showSymbol,
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
}

export type SpecialPriceOptions = {
  /** Group multiplier already resolved by the caller. */
  groupRatio?: number
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
  showCurrencySymbol?: boolean
}

function applyRates(priceUSD: number, options: SpecialPriceOptions): number {
  const withGroup = priceUSD * (options.groupRatio ?? 1)
  return options.showRechargePrice
    ? (withGroup * (options.priceRate ?? 1)) / (options.usdExchangeRate ?? 1)
    : withGroup
}

/**
 * Derive what a customer can act on from an unexpanded billing expression.
 *
 * Returns `null` for models without a billing expression, so callers keep their
 * existing behaviour for plain ratio pricing.
 */
export function summarizeSpecialExpression(
  model: PricingModel,
  options: SpecialPriceOptions = {}
): SpecialPriceSummary | null {
  const expression = model.billing_expr || ''
  if (!expression) return null

  const compiled = compileBillingExpression(expression)
  const tiers =
    compiled.status === 'ready' ? collectTierCalls(compiled.ast) : []

  // 1. One row per countable unit (image size, per call).
  const fromAst = tiers
    .map((tier) => ({ label: tier.label, price: fixedPrice(tier.body) }))
    .filter(
      (tier): tier is { label: string; price: number } =>
        tier.price !== null && tier.price > 0
    )
  const fixed = fromAst.length > 0 ? fromAst : readFixedTiersFromSource(expression)
  if (fixed.length > 0) {
    return {
      rows: fixed.map((tier) => ({
        key: `fixed:${tier.label}`,
        label: tier.label,
        value: formatMoney(
          applyRates(tier.price, options),
          options.showCurrencySymbol ?? true
        ),
      })),
      note: expression.includes('param("size")')
        ? 'per image, by size'
        : 'per call',
    }
  }

  // 2. Credit-billed: the upstream reports credits, not tokens.
  const creditTier = tiers.find((tier) => tier.label === 'credit')
  if (creditTier) {
    const unitPrice = readCreditUnitPrice(creditTier.body)
    if (unitPrice !== null) {
      return {
        rows: [
          {
            key: 'credit',
            label: 'Per credit',
            value: formatMoney(
              applyRates(unitPrice, options),
              options.showCurrencySymbol ?? true
            ),
          },
        ],
        note: 'per credit',
      }
    }
    return { rows: [], note: 'Billed by upstream credits' }
  }

  // 3. Nothing countable: describe the basis in plain language.
  if (expression.includes('hour(') || expression.includes('weekday(')) {
    return { rows: [], note: 'Price varies by time of day' }
  }
  if (expression.includes('param("size")') || expression.includes('"image"')) {
    return { rows: [], note: 'Billed per image, by size' }
  }
  if (expression.includes('fixed(')) {
    return { rows: [], note: 'Billed per call' }
  }
  if (expression.includes('u("')) {
    return { rows: [], note: 'Billed by the usage the provider reports' }
  }
  return { rows: [], note: 'Price depends on the request' }
}
