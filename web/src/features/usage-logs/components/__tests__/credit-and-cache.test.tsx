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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { UsageLog } from '../../data/schema'
import { formatCacheHitRate, getCacheHitRate } from '../../lib/cache-hit-rate'
import { getCreditBillingSummary } from '../../lib/credit-billing'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'

// The live claude-kiro expression: official token prices, credit coefficient
// = $0.25 ÷ GroupRatio 1.85.
const KIRO_EXPR =
  'u("provider") == "kiro" ? tier("credit", u("credits") * 0.13513513513513511 * 1000000) : tier("token", p * 5 + c * 25 + cr * 0.5 + cc * 6.25 + cc1h * 10)'

function kiroOther(extra: Partial<LogOtherData> = {}): LogOtherData {
  return {
    billing_mode: 'tiered_expr',
    billing_unit: 'token',
    expr_b64: btoa(KIRO_EXPR),
    matched_tier: 'credit',
    group_ratio: 1.85,
    user_group_ratio: -1,
    claude: true,
    usage_semantic: 'anthropic',
    ...extra,
  }
}

function makeLog(other: LogOtherData, quota: number, prompt = 0): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 2,
    content: '',
    username: 'user',
    token_name: 'token',
    model_name: 'claude-sonnet-5-5',
    quota,
    prompt_tokens: prompt,
    completion_tokens: 343,
    use_time: 9,
    is_stream: true,
    channel: 2,
    channel_name: '',
    token_id: 1,
    group: 'claude-kiro',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

function renderDetails(log: UsageLog, isAdmin: boolean): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(['status'], {}, { updatedAt: freshAt })
  queryClient.setQueryData(
    ['pricing'],
    { data: [], vendors: [] },
    { updatedAt: freshAt }
  )
  render(
    <QueryClientProvider client={queryClient}>
      <DetailsDialog
        log={log}
        isAdmin={isAdmin}
        isRoot={isAdmin}
        open
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
}

function rowValue(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null
}

afterEach(() => cleanup())

describe('cache hit rate', () => {
  test('OpenAI usage divides cache reads by the prompt that already holds them', () => {
    expect(
      getCacheHitRate({ promptTokens: 4227, other: { cache_tokens: 3888 } })
    ).toBeCloseTo(3888 / 4227)
  })

  test('Anthropic usage adds reads and writes back to the uncached input', () => {
    const rate = getCacheHitRate({
      promptTokens: 4,
      other: {
        usage_semantic: 'anthropic',
        cache_tokens: 14536,
        cache_creation_tokens: 5590,
        cache_creation_tokens_5m: 5590,
      },
    })
    expect(rate).toBeCloseTo(14536 / (4 + 14536 + 5590))
    expect(formatCacheHitRate(rate!)).toBe('72.2%')
  })

  test('a pure cache write is a 0% hit, no cache activity is no rate', () => {
    expect(
      getCacheHitRate({
        promptTokens: 2,
        other: { usage_semantic: 'anthropic', cache_creation_tokens: 20687 },
      })
    ).toBe(0)
    expect(getCacheHitRate({ promptTokens: 500, other: {} })).toBeNull()
  })

  test('never rounds a near miss up to 100%', () => {
    expect(formatCacheHitRate(18303 / 18306)).toBe('99.9%')
  })

  test('the details dialog shows the rate under Token Breakdown', () => {
    renderDetails(
      makeLog(
        kiroOther({
          cache_tokens: 14536,
          cache_creation_tokens: 5590,
          cache_creation_tokens_5m: 5590,
        }),
        19642,
        4
      ),
      false
    )
    expect(rowValue('Cache hit rate')).toBe('72.2%')
  })
})

describe('credit-billed logs', () => {
  test('quote credits and the per-credit price instead of the multiplier', () => {
    renderDetails(makeLog(kiroOther({ credits: 0.0442 }), 5525, 94), false)
    expect(rowValue('Billing Mode')).toBe('Billed per credit')
    expect(rowValue('Credits used')).toBe('0.0442')
    expect(rowValue('Per credit')).toBe('$0.25')
    expect(screen.queryByText('Group Ratio')).toBeNull()
    expect(screen.queryByText('1.8500x')).toBeNull()
  })

  test('derives credits from the charge for logs written before credits were recorded', () => {
    const summary = getCreditBillingSummary(kiroOther(), 5525)
    expect(summary?.unitPriceUSD).toBeCloseTo(0.25)
    expect(summary?.credits).toBeCloseTo(0.0442)
  })

  test('the token fallback of the same expression stays a multiplier', () => {
    expect(
      getCreditBillingSummary(kiroOther({ matched_tier: 'token' }), 1000)
    ).toBeNull()
  })
})

describe('billing expression visibility', () => {
  test('customers never see the raw expression or the tier table', () => {
    renderDetails(makeLog(kiroOther({ credits: 0.0442 }), 5525, 94), false)
    expect(document.body.textContent).not.toContain('tier(')
    expect(document.body.textContent).not.toContain('u("credits")')
    expect(screen.queryByText('Dynamic Pricing')).toBeNull()
  })

  test('administrators still get the dynamic pricing section', () => {
    renderDetails(makeLog(kiroOther({ credits: 0.0442 }), 5525, 94), true)
    expect(screen.getAllByText('Dynamic Pricing').length).toBeGreaterThan(0)
  })
})

describe('backend tier prices (customer view without the expression)', () => {
  function customerOther(extra: Partial<LogOtherData> = {}): LogOtherData {
    const { expr_b64: _expr, ...rest } = kiroOther(extra)
    return rest
  }

  test('quotes the per-credit price the backend computed', () => {
    const other = customerOther({
      credits: 0.0442,
      tier_prices: { unit: 'credit', per_unit: { credits: 0.25 } },
    })
    expect(getCreditBillingSummary(other, 5525)).toEqual({
      unitPriceUSD: 0.25,
      credits: 0.0442,
    })
    renderDetails(makeLog(other, 5525, 94), false)
    expect(rowValue('Per credit')).toBe('$0.25')
    expect(rowValue('Credits used')).toBe('0.0442')
    expect(document.body.textContent).not.toContain('tier(')
  })

  test('old credit rows without tier prices keep the credits but no unit price', () => {
    const other = customerOther({ credits: 0.0442 })
    expect(getCreditBillingSummary(other, 5525)).toEqual({
      unitPriceUSD: null,
      credits: 0.0442,
    })
    renderDetails(makeLog(other, 5525, 94), false)
    expect(rowValue('Credits used')).toBe('0.0442')
    expect(screen.queryByText('Per credit')).toBeNull()
  })

  test('token tier prices already include the group ratio', () => {
    const other = customerOther({
      matched_tier: 'token',
      tier_prices: {
        unit: 'token',
        per_million: { p: 9.25, c: 46.25, cr: 0.925 },
      },
    })
    expect(getCreditBillingSummary(other, 1000)).toBeNull()
    renderDetails(makeLog(other, 1000, 94), false)
    expect(rowValue('Input')).toBe('$9.25/M')
    expect(rowValue('Output')).toBe('$46.25/M')
    expect(screen.queryByText('Group Ratio')).toBeNull()
  })

  test('rows with neither tier prices nor an expression show no unit price', () => {
    const other = customerOther({ matched_tier: 'token' })
    renderDetails(makeLog(other, 1000, 94), false)
    expect(rowValue('Matched Tier')).toBe('token')
    expect(screen.queryByText('Input')).toBeNull()
  })

  test('administrators read the moved expression from admin_info', () => {
    const other = customerOther({
      credits: 0.0442,
      admin_info: { expr_b64: btoa(KIRO_EXPR) },
    })
    expect(getCreditBillingSummary(other, 5525)?.unitPriceUSD).toBeCloseTo(0.25)
    renderDetails(makeLog(other, 5525, 94), true)
    expect(screen.getAllByText('Dynamic Pricing').length).toBeGreaterThan(0)
  })
})
