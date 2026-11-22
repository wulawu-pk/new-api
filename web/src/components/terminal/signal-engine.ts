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
 * Signal grid: the backdrop of reading pages (the legal documents here; the
 * beta docs inline the same engine as a bun-built script, and the beta
 * landing page's manual runs a copy of it). Long text must not sit on
 * anything that moves or glows on its own, so the grid only answers the
 * reader and is still the moment they stop:
 *
 * - Scrolling: a 40px grid follows the page at 0.35× and a 160px layer of
 *   `+` ticks (a few labelled with hex coordinates) at 0.6×, so the content
 *   (1×) floats over two depths; faint streaks run along the grid's
 *   vertical lines in the direction the content moves.
 * - Mouse: the grid brightens around the pointer and an accent crosshair
 *   eases onto the nearest crossing with its grid coordinate; it fades 1.2 s
 *   after the mouse stops. Not on touch.
 * - Click on bare page or plain text (not controls, code or panes): a ring
 *   of crossings lights up outward from the nearest one, by grid
 *   (Manhattan) distance.
 *
 * Frames are requested only while one of these is running; an idle page
 * draws nothing. Reduced motion draws the grid once, fixed, and answers
 * nothing.
 *
 * Colours: lines and labels in the ink of --fx-ink-rgb, the crosshair,
 * streak heads and ripples in the accent (see canvas-colors.ts). On a light
 * page the dark ink is drawn a little stronger, as the same alpha of black
 * on white reads fainter. A theme switch redraws one frame in the new ones.
 */

import {
  isLightInk,
  readAccentRgb,
  readInkRgb,
  watchTheme,
} from './canvas-colors'

export type SignalOptions = {
  reducedMotion?: boolean
  /** Extra selector: clicks inside it never start a ripple. */
  ignore?: string
}

export type SignalHandle = {
  destroy: () => void
}

type Streak = {
  x: number
  y: number
  len: number
  v: number
  life: number
  age: number
  a: number
}

type Ripple = { i: number; j: number; t: number }

const FINE = 40
const COARSE = 160
const FINE_SPEED = 0.35
const COARSE_SPEED = 0.6
const POINTER_RADIUS = 210
const POINTER_HOLD_MS = 1200
const RIPPLE_SECONDS = 1.25
const RIPPLE_CELLS_PER_SECOND = 16
const MAX_STREAKS = 14
const MAX_RIPPLES = 3
const LABEL_FONT = '10px "Geist Mono", ui-monospace, Consolas, monospace'
/** Alpha factor for dark ink on a light page. */
const LIGHT_INK_GAIN = 1.25
const IGNORE =
  'a,button,input,textarea,select,summary,label,pre,code,kbd,table,header,nav,' +
  '[role="button"],[role="tab"],[role="menu"],[role="dialog"],[contenteditable]'

/** Hash of a grid cell, so the labelled ticks stay put while scrolling. */
function cellHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function hexByte(n: number): string {
  return (((n % 256) + 256) % 256).toString(16).padStart(2, '0')
}

/**
 * Starts the signal grid on a full-viewport canvas (position: fixed).
 * Returns null when the canvas has no 2D context, so the caller can keep a
 * CSS grid instead.
 */
export function createSignal(
  canvas: HTMLCanvasElement,
  options: SignalOptions = {}
): SignalHandle | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const reduce = options.reducedMotion ?? false
  const finePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const ignore = options.ignore ? `${IGNORE},${options.ignore}` : IGNORE
  const fineSpeed = reduce ? 0 : FINE_SPEED
  const coarseSpeed = reduce ? 0 : COARSE_SPEED
  let accent = ''
  let ink = ''
  let inkGain = 1
  /** Ink at an alpha given for the dark theme (scaled on light pages). */
  const inked = (alpha: number) => `rgba(${ink},${alpha * inkGain})`
  const readColors = (): boolean => {
    const root = document.documentElement
    const nextInk = readInkRgb(root)
    const next = [readAccentRgb(root).join(','), nextInk.join(',')]
    if (next[0] === accent && next[1] === ink) return false
    accent = next[0]
    ink = next[1]
    inkGain = isLightInk(nextInk) ? 1 : LIGHT_INK_GAIN
    return true
  }
  readColors()

  let W = 0
  let H = 0
  let dpr = 1
  let fineX = 0
  let coarseX = 0
  let scrollY = window.scrollY || 0
  let lastScrollY = scrollY
  let raf = 0
  let lastFrame = 0
  let pointerX = -1e4
  let pointerY = -1e4
  let pointerGlow = 0
  let lastMove = -1e9
  let markX = 0
  let markY = 0
  let markPlaced = false
  const streaks: Streak[] = []
  const ripples: Ripple[] = []

  function kick() {
    if (!raf) raf = window.requestAnimationFrame(frame)
  }

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    fineX = (W / 2) % FINE
    coarseX = (W / 2) % COARSE
    kick()
  }

  // Grid (far layer) and ticks (middle layer), faded out from the top middle
  // like the CSS grid it replaces.
  function drawGrid(c: CanvasRenderingContext2D) {
    const fy = scrollY * fineSpeed
    c.strokeStyle = inked(0.05)
    c.lineWidth = 1
    c.beginPath()
    for (let x = fineX; x <= W; x += FINE) {
      c.moveTo(Math.round(x) + 0.5, 0)
      c.lineTo(Math.round(x) + 0.5, H)
    }
    for (let j = Math.floor(fy / FINE); j * FINE - fy <= H; j++) {
      const y = Math.round(j * FINE - fy) + 0.5
      c.moveTo(0, y)
      c.lineTo(W, y)
    }
    c.stroke()

    const cy = scrollY * coarseSpeed
    const row0 = Math.floor(cy / COARSE)
    c.strokeStyle = inked(0.16)
    c.beginPath()
    for (let x = coarseX; x <= W + 8; x += COARSE) {
      for (let j = row0; j * COARSE - cy <= H + 8; j++) {
        const X = Math.round(x) + 0.5
        const Y = Math.round(j * COARSE - cy) + 0.5
        c.moveTo(X - 4, Y)
        c.lineTo(X + 5, Y)
        c.moveTo(X, Y - 4)
        c.lineTo(X, Y + 5)
      }
    }
    c.stroke()
    c.fillStyle = inked(0.1)
    c.font = LABEL_FONT
    c.textBaseline = 'top'
    for (let col = 0, x = coarseX; x <= W; x += COARSE, col++) {
      for (let j = row0; j * COARSE - cy <= H; j++) {
        if (cellHash(col, j) % 5 !== 0) continue
        c.fillText(
          `${hexByte(col)}:${hexByte(j)}`,
          Math.round(x) + 7,
          Math.round(j * COARSE - cy) + 6
        )
      }
    }

    c.save()
    c.globalCompositeOperation = 'destination-in'
    c.translate(W * 0.5, H * 0.32)
    c.scale(W * 0.72, H * 0.62)
    const mask = c.createRadialGradient(0, 0, 0, 0, 0, 1)
    mask.addColorStop(0, '#000')
    mask.addColorStop(0.5, 'rgba(0,0,0,.75)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = mask
    c.fillRect(-4, -4, 8, 8)
    c.restore()
  }

  function drawPointer(c: CanvasRenderingContext2D) {
    if (pointerGlow < 0.01) return
    const fy = scrollY * fineSpeed
    const R = POINTER_RADIUS
    const glow = c.createRadialGradient(
      pointerX,
      pointerY,
      0,
      pointerX,
      pointerY,
      R
    )
    glow.addColorStop(0, inked(0.13 * pointerGlow))
    glow.addColorStop(1, inked(0))
    c.strokeStyle = glow
    c.lineWidth = 1
    c.beginPath()
    const x0 = fineX + Math.ceil((pointerX - R - fineX) / FINE) * FINE
    for (let x = x0; x <= pointerX + R; x += FINE) {
      c.moveTo(Math.round(x) + 0.5, pointerY - R)
      c.lineTo(Math.round(x) + 0.5, pointerY + R)
    }
    for (
      let j = Math.ceil((pointerY - R + fy) / FINE);
      j * FINE - fy <= pointerY + R;
      j++
    ) {
      const y = Math.round(j * FINE - fy) + 0.5
      c.moveTo(pointerX - R, y)
      c.lineTo(pointerX + R, y)
    }
    c.stroke()

    const X = Math.round(markX) + 0.5
    const Y = Math.round(markY) + 0.5
    c.strokeStyle = `rgba(${accent},${0.75 * pointerGlow})`
    c.beginPath()
    c.moveTo(X - 7, Y)
    c.lineTo(X - 2, Y)
    c.moveTo(X + 3, Y)
    c.lineTo(X + 8, Y)
    c.moveTo(X, Y - 7)
    c.lineTo(X, Y - 2)
    c.moveTo(X, Y + 3)
    c.lineTo(X, Y + 8)
    c.stroke()
    c.fillStyle = `rgba(${accent},${0.9 * pointerGlow})`
    c.fillRect(X - 1, Y - 1, 2, 2)
    c.fillStyle = `rgba(${accent},${0.5 * pointerGlow})`
    c.font = LABEL_FONT
    c.textBaseline = 'bottom'
    c.fillText(
      `${Math.round((markX - fineX) / FINE)},${Math.round((markY + fy) / FINE)}`,
      X + 8,
      Y - 5
    )
  }

  function drawStreaks(c: CanvasRenderingContext2D, dt: number) {
    for (let n = streaks.length - 1; n >= 0; n--) {
      const s = streaks[n]
      s.age += dt
      s.y += s.v * dt
      const k = s.age / s.life
      if (k >= 1 || s.y < -s.len - 40 || s.y > H + s.len + 40) {
        streaks.splice(n, 1)
        continue
      }
      const a = Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k) * s.a
      const tail = s.y + (s.v < 0 ? 1 : -1) * s.len
      const X = s.x + 0.5
      const g = c.createLinearGradient(X, s.y, X, tail)
      g.addColorStop(0, inked(0.32 * a))
      g.addColorStop(1, inked(0))
      c.strokeStyle = g
      c.beginPath()
      c.moveTo(X, s.y)
      c.lineTo(X, tail)
      c.stroke()
      c.fillStyle = `rgba(${accent},${0.6 * a})`
      c.fillRect(s.x - 0.5, s.y - 1, 2, 2)
    }
  }

  function drawRipples(c: CanvasRenderingContext2D, dt: number) {
    const fy = scrollY * fineSpeed
    for (let n = ripples.length - 1; n >= 0; n--) {
      const w = ripples[n]
      w.t += dt
      if (w.t >= RIPPLE_SECONDS) {
        ripples.splice(n, 1)
        continue
      }
      const ring = w.t * RIPPLE_CELLS_PER_SECOND
      const fade = 1 - w.t / RIPPLE_SECONDS
      const reach = Math.ceil(ring + 2)
      for (let gi = w.i - reach; gi <= w.i + reach; gi++) {
        const x = fineX + gi * FINE
        if (x < -8 || x > W + 8) continue
        const di = Math.abs(gi - w.i)
        for (let gj = w.j - (reach - di); gj <= w.j + (reach - di); gj++) {
          const y = gj * FINE - fy
          if (y < -8 || y > H + 8) continue
          const e = 1 - Math.abs(di + Math.abs(gj - w.j) - ring) / 1.4
          if (e <= 0) continue
          const X = Math.round(x) + 0.5
          const Y = Math.round(y) + 0.5
          const r = 2 + 3 * e
          c.strokeStyle = `rgba(${accent},${0.7 * e * e * fade})`
          c.beginPath()
          c.moveTo(X - r, Y)
          c.lineTo(X + r, Y)
          c.moveTo(X, Y - r)
          c.lineTo(X, Y + r)
          c.stroke()
        }
      }
      if (w.t < 0.35) {
        c.fillStyle = `rgba(${accent},${0.9 * (1 - w.t / 0.35)})`
        c.fillRect(
          Math.round(fineX + w.i * FINE) - 1.5,
          Math.round(w.j * FINE - fy) - 1.5,
          4,
          4
        )
      }
    }
  }

  function frame(now: number) {
    raf = 0
    const c = ctx
    if (!c) return
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016
    lastFrame = now
    scrollY = window.scrollY || 0
    if (!reduce && finePointer) {
      const on = now - lastMove < POINTER_HOLD_MS && pointerX > -1e3
      pointerGlow = on
        ? Math.min(1, pointerGlow + dt * 5)
        : Math.max(0, pointerGlow - dt * 1.8)
      const fy = scrollY * fineSpeed
      const tx = fineX + Math.round((pointerX - fineX) / FINE) * FINE
      const ty = Math.round((pointerY + fy) / FINE) * FINE - fy
      if (!markPlaced) {
        markX = tx
        markY = ty
        markPlaced = true
      }
      const follow = 1 - Math.exp(-dt * 20)
      markX += (tx - markX) * follow
      markY += (ty - markY) * follow
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, W, H)
    drawGrid(c)
    if (!reduce) {
      drawPointer(c)
      drawStreaks(c, dt)
      drawRipples(c, dt)
    }
    if (pointerGlow > 0 || streaks.length || ripples.length) kick()
    else lastFrame = 0
  }

  const onScroll = () => {
    const y = window.scrollY || 0
    const dy = y - lastScrollY
    lastScrollY = y
    let count = Math.min(3, Math.abs(dy) / 90) + Math.random() * 0.6
    while (count >= 1 && streaks.length < MAX_STREAKS) {
      count--
      streaks.push({
        x: Math.round(fineX + Math.floor(Math.random() * (W / FINE)) * FINE),
        y: Math.random() * H,
        len:
          60 + Math.min(220, Math.abs(dy) * 1.4) * (0.5 + Math.random() * 0.5),
        v: (dy > 0 ? -1 : 1) * (700 + Math.random() * 500),
        life: 0.5 + Math.random() * 0.4,
        age: 0,
        a: 0.6 + Math.random() * 0.4,
      })
    }
    kick()
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    pointerX = e.clientX
    pointerY = e.clientY
    lastMove = performance.now()
    kick()
  }
  const onPointerLeave = () => {
    lastMove = -1e9
    kick()
  }
  const onClick = (e: MouseEvent) => {
    const target = e.target
    if (e.button || !(target instanceof Element) || target.closest(ignore)) {
      return
    }
    const selection = window.getSelection?.()
    if (selection && !selection.isCollapsed) return
    if (ripples.length >= MAX_RIPPLES) ripples.shift()
    ripples.push({
      i: Math.round((e.clientX - fineX) / FINE),
      j: Math.round((e.clientY + (window.scrollY || 0) * fineSpeed) / FINE),
      t: 0,
    })
    kick()
  }
  const onVisibility = () => {
    if (document.hidden) return
    lastFrame = 0
    kick()
  }

  size()
  window.addEventListener('resize', size)
  const unwatchTheme = watchTheme(() => {
    if (readColors()) kick()
  })
  if (!reduce) {
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick)
    document.addEventListener('visibilitychange', onVisibility)
    if (finePointer) {
      document.addEventListener('pointermove', onPointerMove, { passive: true })
      document.documentElement.addEventListener('mouseleave', onPointerLeave)
    }
  }

  return {
    destroy() {
      window.cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener('resize', size)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('mouseleave', onPointerLeave)
      unwatchTheme()
    },
  }
}
