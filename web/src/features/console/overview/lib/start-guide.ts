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

/**
 * Model for the sample request: the one the user called last, else the
 * default of the key's family (same defaults as the landing page).
 */
export function sampleModel(
  lastModel: string | undefined,
  group: string | undefined
): string {
  if (lastModel) return lastModel
  return group?.startsWith('claude') ? 'claude-sonnet-5-5' : 'gpt-6.2-astra'
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
