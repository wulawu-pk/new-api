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
import type { PricingModel } from '@/features/pricing/types'

import { CREDIT_GROUPS, HIDDEN_GROUPS, sortGroups } from '../../lib/groups'

/*
 * Per-group prices of the models in /api/pricing, already multiplied by the
 * group ratio. Same rules as the live landing page (deploy/site/beta), so the
 * console and the home page always quote the same numbers:
 * - kiro credit expression in a credit group → $ per credit;
 * - video (usage schema with `seconds`) → per second, or per clip;
 * - per-request models (quota_type 1) → image tiers from `tier("1K", fixed(N))`;
 * - token models → input / output / cache read in $ per 1M tokens, taken from
 *   the off-peak (or first) tier of an expression when there is one.
 */

export type PriceRow =
  | { kind: 'credit'; model: string; api: string[]; price: number }
  | {
      kind: 'video'
      model: string
      api: string[]
      unit: 'second' | 'clip'
      price: number | null
    }
  | {
      kind: 'image'
      model: string
      api: string[]
      tiers: { label: string; price: number }[]
    }
  | {
      kind: 'token'
      model: string
      api: string[]
      input: number
      output: number
      cacheRead: number | null
      peak: boolean
      /** Context size of the cheaper tier, e.g. `272K`. */
      longAbove: string
    }

export type PriceGroup = {
  key: string
  ratio: number
  description: string
  credit: boolean
  rows: PriceRow[]
}

const DATED = /-\d{8}$/

/** Interfaces a model can be called through. */
export function modelApis(model: PricingModel): string[] {
  const types = model.supported_endpoint_types ?? []
  const usage = (model as { billing_usage_schema?: Record<string, unknown> })
    .billing_usage_schema
  if (usage?.seconds) return ['videos']
  const out: string[] = []
  if (types.includes('anthropic')) out.push('messages')
  if (
    model.quota_type === 0 &&
    /^(gpt|codex)/i.test(model.model_name) &&
    types.includes('openai')
  ) {
    out.push('responses')
  }
  if (types.includes('openai')) out.push('chat')
  if (types.includes('image-generation')) out.push('images')
  if (types.includes('gemini')) out.push('gemini')
  return out
}

export function priceRow(
  model: PricingModel,
  ratio: number,
  group: string
): PriceRow {
  let expr = model.billing_expr || ''
  const api = modelApis(model)
  const name = model.model_name
  const tiered = model.billing_mode === 'tiered_expr'
  const credit = tiered
    ? /u\("credits"\)\s*\*\s*([\d.]+)\s*\*\s*1000000/.exec(expr)
    : null
  if (credit && CREDIT_GROUPS.has(group)) {
    return {
      kind: 'credit',
      model: name,
      api,
      price: Number(credit[1]) * ratio,
    }
  }
  if (credit) expr = expr.replace(/^[\s\S]*?tier\("credit",[^?:]*\)\s*:\s*/, '')

  const usage = (model as { billing_usage_schema?: Record<string, unknown> })
    .billing_usage_schema
  if (usage?.seconds) {
    const perSecond = /u\("seconds"\)\s*\*\s*([\d.]+)/.exec(expr)
    const fixed = /tier\("[^"]+",\s*([\d.]+)\s*\)/.exec(expr)
    let price: number | null = null
    if (perSecond) price = Number(perSecond[1]) * ratio
    else if (fixed) price = Number(fixed[1]) * ratio
    return {
      kind: 'video',
      model: name,
      api,
      unit: perSecond ? 'second' : 'clip',
      price,
    }
  }

  if (model.quota_type === 1) {
    const tiers: { label: string; price: number }[] = []
    if (tiered) {
      for (const match of expr.matchAll(
        /tier\("([^"]+)",\s*fixed\(([\d.]+)\)\)/g
      )) {
        tiers.push({ label: match[1], price: Number(match[2]) * ratio })
      }
    }
    tiers.sort((a, b) => a.price - b.price)
    return {
      kind: 'image',
      model: name,
      api,
      tiers: tiers.length
        ? tiers
        : [{ label: '', price: (model.model_price ?? 0) * ratio }],
    }
  }

  let input = (model.model_ratio ?? 0) * 2 * ratio
  let output = input * (model.completion_ratio || 1)
  let cacheRead: number | null =
    model.cache_ratio != null ? input * model.cache_ratio : null
  const tierMatch = tiered
    ? (/tier\("off_peak",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)(?:\s*\+\s*cr\s*\*\s*([\d.]+))?/.exec(
        expr
      ) ??
      /tier\("[^"]+",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)(?:\s*\+\s*cr\s*\*\s*([\d.]+))?/.exec(
        expr
      ))
    : null
  if (tierMatch) {
    input = Number(tierMatch[1]) * ratio
    output = Number(tierMatch[2]) * ratio
    if (tierMatch[3] != null) cacheRead = Number(tierMatch[3]) * ratio
  }
  const long = /\blen\s*<=\s*(\d+)/.exec(expr)
  return {
    kind: 'token',
    model: name,
    api,
    input,
    output,
    cacheRead,
    peak: /tier\("peak",/.test(expr),
    longAbove: long ? `${Math.round(Number(long[1]) / 1000)}K` : '',
  }
}

function sortValue(row: PriceRow): number {
  if (row.kind === 'token') return row.input
  if (row.kind === 'image') return row.tiers[0]?.price ?? 0
  return row.price ?? 0
}

/** Groups with their models' prices, in display order; empty groups dropped. */
export function buildPriceGroups(
  models: PricingModel[],
  usableGroup: Record<string, unknown>,
  groupRatio: Record<string, number>
): PriceGroup[] {
  const keys = sortGroups(
    Object.keys(usableGroup).filter((key) => !HIDDEN_GROUPS.has(key))
  )
  return keys
    .map((key) => {
      const ratio = groupRatio[key] != null ? Number(groupRatio[key]) : 1
      const raw = usableGroup[key]
      let description = ''
      if (typeof raw === 'string') description = raw
      else if (raw && typeof raw === 'object' && 'desc' in raw) {
        description = String((raw as { desc: unknown }).desc ?? '')
      }
      const rows = models
        .filter(
          (model) =>
            (model.enable_groups ?? []).includes(key) &&
            !DATED.test(model.model_name)
        )
        .map((model) => priceRow(model, ratio, key))
        .sort(
          (a, b) =>
            sortValue(b) - sortValue(a) || a.model.localeCompare(b.model)
        )
      return { key, ratio, description, credit: CREDIT_GROUPS.has(key), rows }
    })
    .filter((group) => group.rows.length > 0)
}

/** `$1.25`, `$0.375`, `$0.0012`; a dash for missing values. */
export function formatUSD(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value >= 0.01) {
    return `$${value.toFixed(value >= 1 ? 2 : 3).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')}`
  }
  return `$${value.toFixed(4)}`
}

/** `×0.5`, `$0.25 / credit` or "per image / second" for a group header. */
export function groupRatioLabel(
  group: PriceGroup,
  t: (key: string) => string
): string {
  if (group.credit) {
    const credit = group.rows.find((row) => row.kind === 'credit')
    return credit && credit.kind === 'credit'
      ? `${formatUSD(credit.price)} / credit`
      : t('By credit')
  }
  if (group.rows.every((row) => row.kind === 'image' || row.kind === 'video')) {
    return t('Per image / second')
  }
  return `×${Number(group.ratio.toFixed(4))}`
}
