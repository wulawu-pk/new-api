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
import { describe, expect, it } from 'vitest'

import {
  readCreditUnitPrice,
  readFixedTiersFromSource,
  summarizeSpecialExpression,
} from '../special-price'
import { compileBillingExpression } from '../billing-expression/parser'
import type { PricingModel } from '../../types'

function model(
  expression: string,
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: 1,
    model_name: 'm',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['g'],
    billing_mode: 'tiered_expr',
    billing_expr: expression,
    ...overrides,
  }
}

describe('readFixedTiersFromSource', () => {
  it('recovers image size prices from an expression the parser rejects', () => {
    const expression =
      'param("size") in ["1K","1k"] ? tier("1K", fixed(0.045)) : tier("4K", fixed(0.075))'
    expect(compileBillingExpression(expression).status).not.toBe('ready')
    expect(readFixedTiersFromSource(expression)).toEqual([
      { label: '1K', price: 0.045 },
      { label: '4K', price: 0.075 },
    ])
  })

  it('ignores zero and non-numeric prices', () => {
    expect(
      readFixedTiersFromSource('tier("a", fixed(0)) tier("b", fixed(abc))')
    ).toEqual([])
  })
})

describe('summarizeSpecialExpression', () => {
  it('prices one upstream credit', () => {
    const summary = summarizeSpecialExpression(
      model(
        'u("provider") == "kiro" ? tier("credit", u("credits") * 0.25 * 1000000) : tier("token", p * 9.25 + c * 46.25)'
      )
    )
    expect(summary?.rows).toEqual([
      { key: 'credit', label: 'Per credit', value: '$0.25' },
    ])
    expect(summary?.note).toBe('per credit')
  })

  it('applies the group multiplier and the recharge rate to a credit price', () => {
    const summary = summarizeSpecialExpression(
      model('tier("credit", u("credits") * 0.25 * 1000000)'),
      { groupRatio: 2, showRechargePrice: true, priceRate: 1, usdExchangeRate: 2 }
    )
    expect(summary?.rows[0].value).toBe('$0.25')
  })

  it('never returns the raw expression as a row value', () => {
    const expression =
      'u("seconds") > 30 ? tier("long", u("seconds") * 0.3) : tier("short", u("seconds") * 0.4)'
    const summary = summarizeSpecialExpression(model(expression))
    expect(summary?.rows).toEqual([])
    expect(summary?.note).toBe('Billed by the usage the provider reports')
    expect(JSON.stringify(summary)).not.toContain('tier(')
  })

  it('returns null for a model without a billing expression', () => {
    expect(
      summarizeSpecialExpression(
        model('', { billing_mode: undefined })
      )
    ).toBeNull()
  })

  it('explains time-of-day pricing in plain language', () => {
    const summary = summarizeSpecialExpression(
      model(
        'hour("Asia/Shanghai") >= 9 ? tier("peak", p * 3) : tier("off", p * 1.5)'
      )
    )
    expect(summary?.rows).toEqual([])
    expect(summary?.note).toBe('Price varies by time of day')
  })
})

describe('readCreditUnitPrice', () => {
  it('reads the per-credit factor and requires the credits usage field', () => {
    const compiled = compileBillingExpression(
      'tier("credit", u("credits") * 0.135 * 1000000)'
    )
    expect(compiled.status).toBe('ready')
    if (compiled.status !== 'ready') return
    const tierCall = compiled.ast
    expect(readCreditUnitPrice(tierCall)).toBe(0.135)
  })

  it('returns null when several candidate factors make the price ambiguous', () => {
    const compiled = compileBillingExpression(
      'tier("credit", u("credits") * 0.135 * 2)'
    )
    if (compiled.status !== 'ready') return
    expect(readCreditUnitPrice(compiled.ast)).toBeNull()
  })
})
