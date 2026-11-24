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
 * Short names and one-line notes for peroai's groups, shared by the console
 * pages (key picker, model plaza, logs). The same wording is used on the
 * landing page (deploy/site/beta/index.html `META`). Values are i18n keys;
 * groups missing here fall back to the server description, then the key.
 */
export type GroupMeta = { nameKey: string; noteKey: string }

export const GROUP_META: Record<string, GroupMeta> = {
  'gpt-special': {
    nameKey: 'GPT Special',
    noteKey: 'The cheapest GPT group on this site, including gpt-6.2.',
  },
  'gpt-pro': {
    nameKey: 'GPT Enterprise',
    noteKey: 'The stable GPT group.',
  },
  'gpt-promax': {
    nameKey: 'GPT ProMax',
    noteKey: 'The fastest GPT group.',
  },
  'gpt-test': {
    nameKey: 'GPT Main',
    noteKey: 'Low price; every request carries about 20K extra tokens of system prompt.',
  },
  'claude-kiro': {
    nameKey: 'Claude kiro',
    noteKey:
      'Billed per credit at $0.25; credits are not proportional to tokens. Works with any client.',
  },
  'claude-ccmax': {
    nameKey: 'Claude ccmax',
    noteKey:
      'Only accepts requests sent by Claude Code; other clients get 502.',
  },
  'grok-ultra': {
    nameKey: 'Grok Ultra',
    noteKey: 'Context over 200K is billed at the long-context price.',
  },
  deepseek: {
    nameKey: 'DeepSeek',
    noteKey:
      'Weekdays 9–12 and 14–18 Beijing time cost ×2; off-peak prices are shown. Chat API only.',
  },
  'image-all': {
    nameKey: 'Images · Video',
    noteKey:
      'Images are billed per image in 1K / 2K / 4K tiers; video is billed per second through the async /v1/videos API.',
  },
}

/** Display order: groups listed above first, then the rest by key. */
export const GROUP_ORDER = Object.keys(GROUP_META)

/** Groups that are never offered to users. */
export const HIDDEN_GROUPS = new Set(['default', 'auto'])

/** Groups billed per upstream credit instead of by token ratio. */
export const CREDIT_GROUPS = new Set(['claude-kiro'])

export function sortGroups(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a)
    const ib = GROUP_ORDER.indexOf(b)
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    }
    return a.localeCompare(b)
  })
}

type Translate = (key: string) => string

/** Short display name of a group. */
export function groupName(
  key: string,
  t: Translate,
  serverDescription?: string
): string {
  const meta = GROUP_META[key]
  if (meta) return t(meta.nameKey)
  return serverDescription || key
}

/** One-line note of a group, or the server description. */
export function groupNote(
  key: string,
  t: Translate,
  serverDescription?: string
): string {
  const meta = GROUP_META[key]
  if (meta) return t(meta.noteKey)
  return serverDescription ?? ''
}

/** Ratio label such as `×0.5`, or `$0.25 / credit` for credit groups. */
export function ratioLabel(
  key: string,
  ratio: number | undefined,
  creditUnitPrice = 0.25
): string {
  if (CREDIT_GROUPS.has(key)) return `$${creditUnitPrice} / credit`
  if (ratio == null || !Number.isFinite(ratio)) return ''
  return `×${Number(ratio.toFixed(4))}`
}
