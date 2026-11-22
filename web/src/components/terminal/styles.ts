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
 * Class strings that turn the shared `ui/input` and `ui/button` into the
 * console's terminal controls (spec: `.in`, `.btn`). Passed through
 * `className`, so the components keep their behaviour. Dropdowns use
 * `TermSelect` (`./term-select`).
 *
 * The accent border is written `border-(--t-accent)`, not with the shorter
 * t-accent colour name, which Tailwind also reads as "top border, shared
 * theme's dark `--accent`" (see `__tests__/styles.test.ts`).
 */
export const TERM_INPUT =
  'bg-t-bg2 dark:bg-t-bg2 border-t-faint text-t-fg placeholder:text-[var(--t-placeholder)] h-auto rounded-(--t-radius) px-3 py-2.5 text-sm focus-visible:border-(--t-accent) focus-visible:ring-0 aria-invalid:border-t-bad'

export const TERM_BUTTON = 'rounded-full h-auto px-4 py-2 text-sm'

export const TERM_BUTTON_PRIMARY =
  'rounded-full h-auto px-4 py-2 text-sm shadow-[0_8px_24px_-10px_rgb(236_234_230/0.35)] hover:bg-white hover:border-white'

export const TERM_BUTTON_GHOST =
  'rounded-full h-auto px-3 py-1 text-[13px] text-t-dim hover:text-t-fg hover:bg-white/5 border border-transparent'

/** `components/password-input` wraps an `<input>`; style that input. */
export const TERM_PASSWORD =
  'rounded-(--t-radius) [&_input]:bg-t-bg2 [&_input]:dark:bg-t-bg2 [&_input]:border-t-faint [&_input]:text-t-fg [&_input]:h-auto [&_input]:rounded-(--t-radius) [&_input]:ps-3 [&_input]:pe-10 [&_input]:py-2.5 [&_input]:text-sm [&_input]:focus-visible:border-(--t-accent) [&_input]:focus-visible:ring-0 [&_input]:aria-invalid:border-t-bad'
