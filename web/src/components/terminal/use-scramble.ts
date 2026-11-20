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
import { useEffect } from 'react'

const LATIN_GLYPHS = '!<>-_/[]{}=+*^?#%'
const CJK_GLYPHS = '码钥令牌模型分组额度日志钱包状态配置注册登录'

/** Elements that scramble on hover / keyboard focus. */
export const SCRAMBLE_SELECTOR = '[data-scramble]'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const running = new WeakSet<HTMLElement>()

/**
 * Scrambles an element's text then decodes it left to right. CJK characters
 * are replaced with CJK characters so the width does not jump; the element's
 * min-width is pinned for the duration as well.
 */
export function scrambleElement(el: HTMLElement): void {
  if (prefersReducedMotion() || running.has(el)) return
  const nodes: { node: Text; text: string }[] = []
  const walk = (parent: Node) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        nodes.push({ node: child as Text, text: child.textContent })
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child)
      }
    })
  }
  walk(el)
  if (!nodes.length) return

  const total = nodes.reduce((sum, item) => sum + item.text.length, 0)
  const duration = Math.min(420, 120 + total * 30)
  const start = performance.now()
  running.add(el)
  el.style.minWidth = `${el.offsetWidth}px`

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const decoded = Math.floor(progress * total)
    let index = 0
    for (const item of nodes) {
      item.node.textContent = [...item.text]
        .map((ch) => {
          const position = index++
          if (position < decoded || ch === ' ' || ch === '　') return ch
          const pool = ch.charCodeAt(0) > 255 ? CJK_GLYPHS : LATIN_GLYPHS
          return pool[Math.floor(Math.random() * pool.length)]
        })
        .join('')
    }
    if (progress < 1) {
      requestAnimationFrame(tick)
      return
    }
    for (const item of nodes) item.node.textContent = item.text
    running.delete(el)
    el.style.minWidth = ''
  }
  requestAnimationFrame(tick)
}

/**
 * Installs one delegated listener: interactive monospace text marked with
 * `data-scramble` scrambles on pointer hover and on keyboard focus.
 */
export function useScrambleText(): void {
  useEffect(() => {
    const onOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        SCRAMBLE_SELECTOR
      ) as HTMLElement | null
      const from = event.relatedTarget as Node | null
      if (target && !(from && target.contains(from))) scrambleElement(target)
    }
    const onFocus = (event: FocusEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        SCRAMBLE_SELECTOR
      ) as HTMLElement | null
      if (target && target.matches(':focus-visible')) scrambleElement(target)
    }
    document.addEventListener('pointerover', onOver)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('focusin', onFocus)
    }
  }, [])
}
