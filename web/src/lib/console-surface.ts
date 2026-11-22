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
 * Console surface classes, matching the public landing pages: one
 * rounded-3xl frame, pill segmented toggles and a monospace eyebrow.
 */
export const CONSOLE_FRAME =
  'border-border bg-background overflow-hidden rounded-3xl border'

/**
 * The same frame for a `Card`. A real border, not the card ring: the default
 * preset replaces card box-shadows (and so the ring) with a soft elevation.
 */
export const CONSOLE_CARD = 'bg-background border-border rounded-3xl border'

/** Hand-rolled segmented toggles; prefer `TabsList variant='pill'` for tabs. */
export const CONSOLE_SEGMENT = {
  group:
    'bg-muted inline-flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-full p-1',
  item: 'focus-visible:ring-ring h-8 shrink-0 rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none',
  active: 'bg-background text-foreground shadow-xs',
  idle: 'text-muted-foreground hover:text-foreground',
}

export const CONSOLE_EYEBROW =
  'font-ascii text-muted-foreground text-[11px] tracking-wide uppercase'

/** Foreground pill for the one main action of a console page; pass to `Button`. */
export const CONSOLE_PRIMARY_BUTTON =
  'bg-foreground text-background hover:bg-foreground/85 rounded-full px-4'
