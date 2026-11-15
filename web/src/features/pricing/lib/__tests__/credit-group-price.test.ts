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

import type { PricingModel } from '../../types'
import { getDynamicPricingSummary } from '../dynamic-price'
import {
  buildGroupSections,
  formatCreditGroupLabel,
  getCreditGroupPriceUSD,
  getCreditGroupUnitPrice,
  modelForGroup,
} from '../group-sections'
import { summarizeSpecialExpression } from '../special-price'

// The live shape: official token prices, the 1.85 markup in the group ratio.
const CLAUDE_EXPR =
  'u("provider") == "kiro" ? tier("credit", u("credits") * 0.135135135135 * 1000000) : tier("token", p * 2 + c * 10)'
const RATIOS = { 'claude-kiro': 1.85, 'claude-ccmax': 1.85 }

function model(
  name: string,
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: name.length,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['claude-kiro', 'claude-ccmax'],
    billing_mode: 'tiered_expr',
    billing_expr: CLAUDE_EXPR,
    group_ratio: RATIOS,
    ...overrides,
  }
}

describe('credit-billed group price', () => {
  it('multiplies the expression rate by the group ratio', () => {
    const models = [model('claude-a'), model('claude-b')]
    expect(getCreditGroupUnitPrice(models, 'claude-kiro')).toBe(0.135135135135)
    expect(getCreditGroupPriceUSD(models, 'claude-kiro', RATIOS)).toBeCloseTo(
      0.25,
      10
    )
    expect(
      formatCreditGroupLabel(models, 'claude-kiro', RATIOS, 'credit')
    ).toBe('$0.25 / credit')
  })

  it('accepts a string ratio and treats a missing one as 1', () => {
    const models = [model('claude-a')]
    expect(
      getCreditGroupPriceUSD(models, 'claude-kiro', { 'claude-kiro': '2' })
    ).toBeCloseTo(0.27027027027, 10)
    expect(getCreditGroupPriceUSD(models, 'claude-kiro', {})).toBe(
      0.135135135135
    )
  })

  it('returns null for a token-billed group sharing the expression', () => {
    const models = [model('claude-a')]
    expect(getCreditGroupPriceUSD(models, 'claude-ccmax', RATIOS)).toBeNull()
    expect(
      formatCreditGroupLabel(models, 'claude-ccmax', RATIOS, 'credit')
    ).toBeNull()
  })

  it('returns null without a credit tier or when the rates disagree', () => {
    expect(
      getCreditGroupUnitPrice(
        [model('claude-a', { billing_expr: 'tier("token", p * 2)' })],
        'claude-kiro'
      )
    ).toBeNull()
    expect(
      getCreditGroupUnitPrice(
        [model('claude-a', { enable_groups: ['claude-ccmax'] })],
        'claude-kiro'
      )
    ).toBeNull()
    expect(
      getCreditGroupUnitPrice(
        [
          model('claude-a'),
          model('claude-b', {
            billing_expr: 'tier("credit", u("credits") * 0.2 * 1000000)',
          }),
        ],
        'claude-kiro'
      )
    ).toBeNull()
  })

  it('puts the per-credit price on the claude-kiro section only', () => {
    const sections = buildGroupSections([model('claude-a')], {}, RATIOS)
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s]))
    expect(byKey['claude-kiro'].ratio).toBe(1.85)
    expect(byKey['claude-kiro'].creditPrice).toBeCloseTo(0.25, 10)
    expect(byKey['claude-ccmax'].ratio).toBe(1.85)
    expect(byKey['claude-ccmax'].creditPrice).toBeUndefined()
  })
})

describe('model prices after the markup moves into the group ratio', () => {
  it('quotes $0.25 per credit on a claude-kiro card', () => {
    const summary = summarizeSpecialExpression(model('claude-a'), {
      groupRatio: 1.85,
    })
    expect(summary?.rows).toEqual([
      { key: 'credit', label: 'Per credit', value: '$0.25' },
    ])
  })

  it('quotes official token prices times 1.85 in claude-ccmax', () => {
    const summary = getDynamicPricingSummary(
      modelForGroup(model('claude-a'), 'claude-ccmax'),
      { tokenUnit: 'M', groupRatioMultiplier: 1.85 }
    )
    expect(summary?.isSpecialExpression).toBe(false)
    expect(
      summary?.primaryEntries.map((entry) => [entry.field, entry.formatted])
    ).toEqual([
      ['inputPrice', '$3.7'],
      ['outputPrice', '$18.5'],
    ])
  })
})
