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
/**
 * A "plan" chosen on the landing page (group, model, client) waiting for the
 * visitor to sign up or sign in. After the first successful sign-in the
 * console creates a key in that group once, then forgets the plan.
 *
 * Only these three short identifiers are stored (sessionStorage, 30 min);
 * no credentials. The group is checked by the server when the key is made.
 */
const PLAN_KEY = 'peroai:pending-plan'
const PLAN_TTL_MS = 30 * 60 * 1000
const SAFE = /^[A-Za-z0-9 ._:-]{1,64}$/

export type PendingPlan = { group: string; model?: string; client?: string }

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE.test(value) ? value : undefined
}

/** Plan from landing-page search params (`plan`, `model`, `client`). */
export function planFromSearch(search: {
  plan?: unknown
  model?: unknown
  client?: unknown
}): PendingPlan | null {
  const group = clean(search.plan)
  if (!group) return null
  return { group, model: clean(search.model), client: clean(search.client) }
}

export function savePendingPlan(plan: PendingPlan): void {
  try {
    sessionStorage.setItem(
      PLAN_KEY,
      JSON.stringify({ ...plan, at: Date.now() })
    )
  } catch {
    /* storage unavailable: no automatic key */
  }
}

export function readPendingPlan(now = Date.now()): PendingPlan | null {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.at !== 'number' || now - parsed.at > PLAN_TTL_MS) {
      sessionStorage.removeItem(PLAN_KEY)
      return null
    }
    return planFromSearch({
      plan: parsed.group,
      model: parsed.model,
      client: parsed.client,
    })
  } catch {
    return null
  }
}

/** Reads and removes the plan so the key is only created once. */
export function consumePendingPlan(now = Date.now()): PendingPlan | null {
  const plan = readPendingPlan(now)
  try {
    sessionStorage.removeItem(PLAN_KEY)
  } catch {
    /* ignore */
  }
  return plan
}
