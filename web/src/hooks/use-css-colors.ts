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
import { useEffect, useState } from 'react'

import { useTheme } from '@/context/theme-provider'

let probe: CanvasRenderingContext2D | null = null

/**
 * Converts any CSS color (oklch, color-mix, named, ...) to `rgb(r, g, b)` by
 * painting one pixel. Canvas and WebGL effects only parse sRGB strings.
 */
function toRgb(value: string, fallback: string) {
  if (!value) return fallback
  probe ??= document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true })
  if (!probe) return fallback
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = fallback
  probe.fillStyle = value
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

function resolve<K extends string>(vars: Record<K, string>) {
  const style = getComputedStyle(document.documentElement)
  const result = {} as Record<K, string>
  for (const key of Object.keys(vars) as K[]) {
    result[key] = toRgb(style.getPropertyValue(vars[key]).trim(), '#808080')
  }
  return result
}

/**
 * Resolves theme CSS custom properties (e.g. `--background`) to concrete
 * `rgb()` strings for components that draw on canvas. Re-resolves when the
 * light/dark mode or a theme preset on `<html>` changes.
 *
 * Pass a module-level constant: the object identity is the cache key.
 */
export function useCssColors<K extends string>(vars: Record<K, string>) {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState(() => resolve(vars))

  useEffect(() => {
    const update = () => {
      const next = resolve(vars)
      setColors((prev) =>
        (Object.keys(next) as K[]).every((key) => prev[key] === next[key])
          ? prev
          : next
      )
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [vars, resolvedTheme])

  return colors
}
