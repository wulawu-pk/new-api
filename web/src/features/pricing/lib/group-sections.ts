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
import {
  readGroupDescription,
  readGroupRatio,
  type PricingModel,
  type UsableGroups,
} from '../types'
import { unwrapExpressionParens } from './billing-expression/structure'

// ----------------------------------------------------------------------------
// Group sections
// ----------------------------------------------------------------------------
// The model square reads like a shop window: one block per group, in a fixed
// order, each with the administrator's own description and a price table quoted
// in that group's multiplier.
//
// Grouping is a pure function of the pricing payload, so the sidebar's group
// filter keeps working unchanged — selecting a group simply leaves one section.

export type PricingGroupSection = {
  /** Group slug, also the React key and the anchor id. */
  key: string
  /** Administrator-written description; falls back to the slug. */
  description: string
  /** Group multiplier used to quote this section's prices. */
  ratio?: number
  models: PricingModel[]
}

/**
 * Reading order for the shipped groups. Unknown groups follow in backend order,
 * so an administrator can add a group without touching the frontend.
 */
export const PREFERRED_GROUP_ORDER = [
  'gpt-pro',
  'gpt-promax',
  'gpt-test',
  'claude-kiro',
  'claude-ccmax',
  'gemini-ultra',
  'gemini-pro',
  'image-gpt',
  'image-all',
]

/**
 * Groups whose channel reports upstream credits. A shared Claude model carries
 * one expression for every group, `u("provider") == "kiro" ? tier("credit", …)
 * : <token price>`, and only these groups ever take the credit branch. Every
 * other section must quote the token branch, or a token-billed group would
 * advertise a per-credit price it never charges.
 */
export const CREDIT_BILLED_GROUPS = new Set(['claude-kiro'])

const PROVIDER_CREDIT_BRANCH =
  /^\s*u\(\s*"provider"\s*\)\s*==\s*"[^"]*"\s*\?\s*tier\(\s*"credit"\s*,[^?:]*\)\s*:\s*([\s\S]+)$/

/** The token-priced remainder of a provider-conditional credit expression. */
export function stripProviderCreditBranch(expression: string): string | null {
  const match = PROVIDER_CREDIT_BRANCH.exec(expression)
  if (!match) return null
  return unwrapExpressionParens(match[1])
}

/** The model as a customer of `group` is billed for it. */
export function modelForGroup(
  model: PricingModel,
  group: string
): PricingModel {
  if (CREDIT_BILLED_GROUPS.has(group) || !model.billing_expr) return model
  const tokenOnly = stripProviderCreditBranch(model.billing_expr)
  return tokenOnly ? { ...model, billing_expr: tokenOnly } : model
}

/** '' and 'auto' are routing pseudo-groups with no price of their own. */
const NON_SECTION_GROUPS = new Set(['', 'auto'])

/**
 * `default` is an alias of the primary GPT group (same channel, same
 * multiplier), so listing it as a second section would repeat the same models at
 * the same price. It still gets a section when a model has no other group, so
 * nothing priced is ever hidden.
 */
const ALIAS_GROUPS = new Set(['default'])

function normalize(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * Bucket models by their enabled group, in {@link PREFERRED_GROUP_ORDER}.
 *
 * A model enabled in several groups appears in each of them with that group's
 * multiplier, which is what a per-group price list promises.
 */
export function buildGroupSections(
  models: PricingModel[],
  usableGroup: UsableGroups,
  groupRatio: Record<string, number>,
  preferredOrder: string[] = PREFERRED_GROUP_ORDER
): PricingGroupSection[] {
  const byGroup = new Map<string, PricingModel[]>()

  for (const model of models) {
    const groups = Array.isArray(model.enable_groups) ? model.enable_groups : []
    const cleaned = groups.filter(
      (group) => !NON_SECTION_GROUPS.has(normalize(group))
    )
    const primary = cleaned.filter(
      (group) => !ALIAS_GROUPS.has(normalize(group))
    )
    const targets = primary.length > 0 ? primary : cleaned
    if (targets.length === 0) targets.push('default')
    for (const group of targets) {
      const bucket = byGroup.get(group)
      if (bucket) {
        bucket.push(model)
      } else {
        byGroup.set(group, [model])
      }
    }
  }

  const knownOrder = [...preferredOrder, ...Object.keys(usableGroup)]
  const rank = (key: string) => {
    const index = knownOrder.indexOf(key)
    return index === -1 ? knownOrder.length : index
  }
  const keys = [...byGroup.keys()].sort((a, b) => {
    const delta = rank(a) - rank(b)
    return delta !== 0 ? delta : a.localeCompare(b)
  })

  return keys.map((key) => {
    const ratio = groupRatio[key]
    // The payload may send either a bare description string or a {desc} object.
    const description = normalize(readGroupDescription(usableGroup, key))
    const configured = readGroupRatio(usableGroup, key)
    return {
      key,
      description: description || key,
      ratio:
        typeof ratio === 'number' && Number.isFinite(ratio)
          ? ratio
          : configured,
      models: (byGroup.get(key) ?? []).map((model) =>
        modelForGroup(model, key)
      ),
    }
  })
}

/** Unique model names in first-seen order, for the perf summary request. */
export function collectModelNames(models: PricingModel[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const model of models) {
    const name = model.model_name
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}
