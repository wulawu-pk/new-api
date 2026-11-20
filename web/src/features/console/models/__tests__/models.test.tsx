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
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as pricingApi from '@/features/pricing/api'
import type { PricingModel } from '@/features/pricing/types'

import { ConsoleModels } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { buildPriceGroups, formatUSD, priceRow } from '../lib/price-rows'

vi.mock('@/features/pricing/api', () => ({ getPricing: vi.fn() }))

function model(partial: Partial<PricingModel>): PricingModel {
  return {
    model_name: 'gpt-6-astra',
    quota_type: 0,
    model_ratio: 2.5,
    completion_ratio: 4,
    cache_ratio: 0.1,
    model_price: 0,
    enable_groups: ['gpt-pro'],
    supported_endpoint_types: ['openai'],
    ...partial,
  } as PricingModel
}

const KIRO_EXPR =
  'u("provider") == "kiro" ? tier("credit", u("credits") * 0.13513513513513511 * 1000000) : tier("token", p * 5 + c * 25)'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('price rows', () => {
  it('quotes token models per 1M tokens with the group ratio applied', () => {
    const row = priceRow(model({}), 0.5, 'gpt-pro')
    expect(row).toMatchObject({
      kind: 'token',
      input: 2.5,
      output: 10,
      cacheRead: 0.25,
    })
    expect(row.api).toEqual(['responses', 'chat'])
  })

  it('quotes the kiro expression per credit in a credit group and by token elsewhere', () => {
    const kiro = model({
      model_name: 'claude-sonnet-5-5',
      billing_mode: 'tiered_expr',
      billing_expr: KIRO_EXPR,
    } as never)
    const credit = priceRow(kiro, 1.85, 'claude-kiro')
    expect(credit.kind).toBe('credit')
    expect(credit.kind === 'credit' && credit.price).toBeCloseTo(0.25)
    expect(priceRow(kiro, 1.85, 'claude-ccmax')).toMatchObject({
      kind: 'token',
      input: 9.25,
      output: 46.25,
    })
  })

  it('lists image tiers cheapest first', () => {
    const image = model({
      model_name: 'gpt-image-2',
      quota_type: 1,
      billing_mode: 'tiered_expr',
      billing_expr:
        'size == "4K" ? tier("4K", fixed(0.09)) : tier("1K", fixed(0.054))',
    } as never)
    const row = priceRow(image, 1, 'image-all')
    expect(row.kind === 'image' && row.tiers.map((t) => t.label)).toEqual([
      '1K',
      '4K',
    ])
  })

  it('drops hidden and empty groups and dated snapshots', () => {
    const groups = buildPriceGroups(
      [
        model({}),
        model({ model_name: 'gpt-6-astra-20260101' }),
        model({ model_name: 'x', enable_groups: ['default'] }),
      ],
      { 'gpt-pro': 'GPT', default: 'Default', empty: 'Empty' },
      { 'gpt-pro': 0.5 }
    )
    expect(groups.map((g) => g.key)).toEqual(['gpt-pro'])
    expect(groups[0].rows).toHaveLength(1)
  })

  it('formats dollars like the landing page, trimming trailing zeros', () => {
    expect(formatUSD(2.5)).toBe('$2.5')
    expect(formatUSD(0.25)).toBe('$0.25')
    expect(formatUSD(0.0012)).toBe('$0.0012')
    expect(formatUSD(null)).toBe('—')
  })
})

describe('console model plaza', () => {
  it('names the failed endpoint when prices cannot load', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue({
      success: false,
      message: 'x',
    } as never)
    renderConsole(<ConsoleModels />)

    expect(await screen.findByText('/api/pricing')).toBeInTheDocument()
  })

  it('filters by group and by name', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue({
      success: true,
      data: [
        model({}),
        model({ model_name: 'deepseek-v4-pro', enable_groups: ['deepseek'] }),
      ],
      vendors: [],
      group_ratio: { 'gpt-pro': 0.5, deepseek: 0.65 },
      usable_group: { 'gpt-pro': 'GPT', deepseek: 'DS' },
    } as never)
    const user = userEvent.setup()
    renderConsole(<ConsoleModels />)

    expect(
      await screen.findByRole('region', { name: 'GPT Enterprise' })
    ).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('group', { name: 'Filter by group' })).getByRole(
        'button',
        { name: 'DeepSeek' }
      )
    )
    expect(
      screen.queryByRole('region', { name: 'GPT Enterprise' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('deepseek-v4-pro')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByLabelText('Search model'), 'nothing-like-this')
    expect(screen.getByText('No model with that name.')).toBeInTheDocument()
  })
})
