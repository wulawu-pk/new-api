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

/** The start guide's sample request, one curl argument per line. */
export function firstRequestCurl(args: {
  base: string
  key: string
  model: string
}): string {
  const body = JSON.stringify({
    model: args.model,
    messages: [{ role: 'user', content: 'hi' }],
  })
  return [
    `curl ${args.base}/v1/chat/completions \\`,
    `  -H "Authorization: Bearer ${args.key}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${body}'`,
  ].join('\n')
}

/** Image and video models answer on other endpoints, not chat completions. */
const NOT_CHAT = /image|video|sora|veo|kling|seedance/i

/**
 * Model for the sample request, so that it runs on the key as shown: the
 * latest chat model the user called in the key's group; else the family
 * default (same as the landing page) when the group has it; else the
 * group's first chat model; else the family default. `recent` is newest
 * first; `groupModels` are the models the group serves.
 */
export function sampleModel(
  recent: { model_name: string; group: string }[],
  group: string | undefined,
  groupModels: string[]
): string {
  const used = recent.find(
    (row) => row.group === group && !NOT_CHAT.test(row.model_name)
  )
  if (used) return used.model_name
  const preferred = group?.startsWith('claude')
    ? 'claude-sonnet-5-5'
    : 'gpt-6.2-astra'
  if (groupModels.includes(preferred)) return preferred
  return groupModels.find((model) => !NOT_CHAT.test(model)) ?? preferred
}

/** API base for the sample: the configured server address, no trailing slash. */
export function apiBase(serverAddress: unknown): string {
  const fromStatus =
    typeof serverAddress === 'string' && /^https?:\/\//.test(serverAddress)
      ? serverAddress
      : ''
  const base = fromStatus || window.location.origin
  return base.replace(/\/+$/, '')
}

const HIDDEN_FLAG = 'peroai:start-guide-hidden'

/** Whether the user folded the start guide away (kept across visits). */
export function readGuideHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_FLAG) === '1'
  } catch {
    return false
  }
}

export function writeGuideHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_FLAG, '1')
    else localStorage.removeItem(HIDDEN_FLAG)
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}
