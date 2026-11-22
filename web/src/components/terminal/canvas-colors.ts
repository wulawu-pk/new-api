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

/*
 * Colours the canvas backdrops (sonar, relay, signal grid) take from the
 * page, and the hook that tells them the theme changed. Shared with the beta
 * landing page and docs, which inline bun-built copies of the engines: the
 * console sets --t-accent-rgb, those pages --accent-rgb; all three set
 * --fx-ink-rgb (white on dark, near black on light) and switch the theme
 * through the `class` or `data-theme` attribute of <html>.
 */

export type Rgb = [number, number, number]

/** Accent when the page sets none: mint #3DDBA5, as in theme-presets.css. */
export const DEFAULT_ACCENT: Rgb = [61, 219, 165]
/** Ink when the page sets none: white, the dark theme's. */
export const DEFAULT_INK: Rgb = [255, 255, 255]

function readRgb(el: Element, names: string[], fallback: Rgb): Rgb {
  const style = getComputedStyle(el)
  for (const name of names) {
    const parts = style
      .getPropertyValue(name)
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]]
    }
  }
  return fallback
}

/** The page accent as RGB, from --t-accent-rgb ("61 219 165") or --accent-rgb. */
export function readAccentRgb(el: Element): Rgb {
  return readRgb(el, ['--t-accent-rgb', '--accent-rgb'], DEFAULT_ACCENT)
}

/** The canvas ink as RGB, from --fx-ink-rgb. */
export function readInkRgb(el: Element): Rgb {
  return readRgb(el, ['--fx-ink-rgb'], DEFAULT_INK)
}

/**
 * Light ink means a dark page. Each engine keeps its exact dark palette for
 * light ink, so the dark theme draws the same pixels as before the light
 * theme existed, and switches to its light palette for dark ink.
 */
export function isLightInk(ink: Rgb): boolean {
  return 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2] > 128
}

/**
 * Calls `onChange` when <html> switches theme (its `class` or `data-theme`
 * changes). Returns the function that stops watching.
 */
export function watchTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined
  const root = document.documentElement
  let last = `${root.className}|${root.dataset.theme ?? ''}`
  const observer = new MutationObserver(() => {
    const now = `${root.className}|${root.dataset.theme ?? ''}`
    if (now === last) return
    last = now
    onChange()
  })
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
  return () => observer.disconnect()
}
