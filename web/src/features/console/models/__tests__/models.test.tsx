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

const TWO_GROUPS = {
  success: true,
  data: [
    model({}),
    model({
      model_name: 'gpt-6.2-sol',
      enable_groups: ['gpt-pro', 'deepseek'],
    }),
    model({ model_name: 'deepseek-v4-pro', enable_groups: ['deepseek'] }),
  ],
  vendors: [],
  group_ratio: { 'gpt-pro': 0.5, deepseek: 0.65 },
  usable_group: { 'gpt-pro': 'GPT', deepseek: 'DS' },
}

function groupButton(name: RegExp) {
  return within(screen.getByRole('group', { name: 'Model groups' })).getByRole(
    'button',
    { name }
  )
}

describe('console model plaza', () => {
  it('names the failed endpoint when prices cannot load', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue({
      success: false,
      message: 'x',
    } as never)
    renderConsole(<ConsoleModels />)

    expect(await screen.findByText('/api/pricing')).toBeInTheDocument()
  })

  it('shows only the first group until another group is picked from the list', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue(TWO_GROUPS as never)
    const user = userEvent.setup()
    renderConsole(<ConsoleModels />)

    expect(
      await screen.findByRole('region', { name: 'GPT Enterprise' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'DeepSeek' })
    ).not.toBeInTheDocument()
    expect(groupButton(/^GPT Enterprise/)).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await user.click(groupButton(/^DeepSeek/))

    expect(screen.getByRole('region', { name: 'DeepSeek' })).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'GPT Enterprise' })
    ).not.toBeInTheDocument()
  })

  it('a group passed from the link opens first and a pick is reported back', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue(TWO_GROUPS as never)
    const onGroupChange = vi.fn()
    const user = userEvent.setup()
    renderConsole(
      <ConsoleModels group='deepseek' onGroupChange={onGroupChange} />
    )

    expect(
      await screen.findByRole('region', { name: 'DeepSeek' })
    ).toBeInTheDocument()
    await user.click(groupButton(/^GPT Enterprise/))
    expect(onGroupChange).toHaveBeenCalledWith('gpt-pro')
  })

  it('arrow keys on the group list move to the next group and wrap around', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue(TWO_GROUPS as never)
    const user = userEvent.setup()
    renderConsole(<ConsoleModels />)

    await screen.findByRole('region', { name: 'GPT Enterprise' })
    groupButton(/^GPT Enterprise/).focus()
    await user.keyboard('{ArrowDown}')
    expect(groupButton(/^DeepSeek/)).toHaveFocus()
    expect(screen.getByRole('region', { name: 'DeepSeek' })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    expect(groupButton(/^GPT Enterprise/)).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('a search shows every group with a match and says when nothing matches', async () => {
    vi.mocked(pricingApi.getPricing).mockResolvedValue(TWO_GROUPS as never)
    const user = userEvent.setup()
    renderConsole(<ConsoleModels />)

    await screen.findByRole('region', { name: 'GPT Enterprise' })
    await user.type(screen.getByLabelText('Search model'), 'gpt-6.2')

    expect(
      screen.getByRole('region', { name: 'GPT Enterprise' })
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'DeepSeek' })).toBeInTheDocument()
    expect(screen.getAllByText('gpt-6.2-sol')).toHaveLength(2)
    expect(screen.queryByText('gpt-6-astra')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search model'))
    await user.type(screen.getByLabelText('Search model'), 'nothing-like-this')
    expect(screen.getByText('No model with that name.')).toBeInTheDocument()
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })
})
