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
 * ASCII relay animation (the "线路" background on the landing and sign-in
 * pages): requests flow as text from clients on the left, through the
 * peroai ring in the middle, to models on the right. Ported from the beta
 * landing page (deploy/site/beta/index.html) so both look identical.
 *
 * It only runs while visible and the tab is active, and draws a single
 * still frame when the user prefers reduced motion.
 */

type Point = [number, number]
type Lane = [Point, Point, Point, Point]
type Particle = {
  side: 0 | 1
  lane: number
  t: number
  v: number
  txt: string
  tmp?: boolean
  dead?: boolean
}

export type RelayOptions = {
  /** Draw client and model labels at the lane ends (needs ≥520px width). */
  labels?: boolean
  clients?: string[]
  models?: string[]
  reducedMotion?: boolean
}

export type RelayHandle = {
  refresh: () => void
  /** Sends a quick train of requests through the selected lane. */
  burst: () => void
  select: (client: number, models: string[], model: number) => void
  destroy: () => void
}

const TOKENS = [
  '{"model":',
  '"stream":true',
  'messages',
  'sk-···a91f',
  'Bearer',
  'POST /v1',
  'anthropic',
  '200 OK',
  'tokens:1388',
  'cache_read',
  'data: {',
  '[DONE]',
  'delta',
  'usage',
]
const RAMP = ' .:-=+*#%@'
const GLITCH = '!<>-_\\/[]{}=+*^?#%'
const COLORS = [
  null,
  'rgba(141,146,156,.2)',
  'rgba(141,146,156,.42)',
  '#ECEAE6',
  'rgba(236,234,230,.5)',
  '#FF7AB6',
  '#FF7AB6',
  '#ECEAE6',
  'rgba(236,234,230,.7)',
  'rgba(255,122,182,.55)',
]

function bezier(p: Lane, t: number): Point {
  const u = 1 - t
  return [
    u * u * u * p[0][0] +
      3 * u * u * t * p[1][0] +
      3 * u * t * t * p[2][0] +
      t * t * t * p[3][0],
    u * u * u * p[0][1] +
      3 * u * u * t * p[1][1] +
      3 * u * t * t * p[2][1] +
      t * t * t * p[3][1],
  ]
}

export function createRelay(
  canvas: HTMLCanvasElement,
  labelLayer: HTMLElement | null,
  options: RelayOptions = {}
): RelayHandle {
  const ctx = canvas.getContext('2d')
  const clients = options.clients ?? ['Claude Code', 'Codex', 'curl', 'Python']
  let models = options.models ?? ['claude', 'gpt', 'grok', 'deepseek']
  const reduce = options.reducedMotion ?? false
  let W = 0
  let H = 0
  let cw = 8
  let ch = 16
  let cols = 0
  let rows = 0
  let mask = new Float32Array(0)
  let ring = new Float32Array(0)
  let rails = new Uint8Array(0)
  let laneL: Lane[] = []
  let laneR: Lane[] = []
  let parts: Particle[] = []
  let pulse = 0
  const mouse = { c: -99, r: -99 }
  let ready = false
  let running = false
  let visible = false
  let last = 0
  let selClient = -1
  let selModel = -1
  let buf: string[] = []
  let col: number[] = []

  const pickL = () =>
    selClient >= 0 && Math.random() < 0.65
      ? selClient
      : Math.floor(Math.random() * clients.length)
  const pickR = () =>
    selModel >= 0 && Math.random() < 0.7
      ? selModel
      : Math.floor(Math.random() * models.length)
  const newPart = (t = 0): Particle => ({
    side: 0,
    lane: pickL(),
    t,
    v: 0.0026 + Math.random() * 0.002,
    txt: TOKENS[Math.floor(Math.random() * TOKENS.length)],
  })

  function setup(): boolean {
    if (!ctx) return false
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) return false
    W = rect.width
    H = rect.height
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const fs = W < 640 ? 11 : 12.5
    ctx.font = `${fs}px "Geist Mono Variable", "Geist Mono", ui-monospace, Consolas, monospace`
    cw = ctx.measureText('M').width || 7
    ch = Math.round(fs * 1.3)
    cols = Math.ceil(W / cw)
    rows = Math.ceil(H / ch)
    const showLabels = Boolean(options.labels) && W >= 520
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(H * 0.3, W * (showLabels ? 0.11 : 0.2))

    const off = document.createElement('canvas')
    off.width = Math.ceil(W)
    off.height = Math.ceil(H)
    const o = off.getContext('2d')
    if (!o) return false
    o.fillStyle = '#fff'
    o.font = `700 ${Math.round(R * 1.25)}px "Geist Variable", "Geist", Arial, sans-serif`
    o.textAlign = 'center'
    o.textBaseline = 'middle'
    o.fillText('P', cx + R * 0.04, cy + R * 0.06)
    const pd = o.getImageData(0, 0, off.width, off.height).data
    o.clearRect(0, 0, off.width, off.height)
    o.strokeStyle = '#fff'
    o.lineWidth = Math.max(5, R * 0.1)
    o.beginPath()
    o.arc(cx, cy, R, 0, Math.PI * 2)
    o.stroke()
    const rd = o.getImageData(0, 0, off.width, off.height).data
    mask = new Float32Array(cols * rows)
    ring = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.min(off.width - 1, Math.floor(c * cw + cw / 2))
        const y = Math.min(off.height - 1, Math.floor(r * ch + ch / 2))
        const idx = (y * off.width + x) * 4 + 3
        mask[r * cols + c] = pd[idx] / 255
        ring[r * cols + c] = rd[idx] / 255
      }
    }
    const x0 = showLabels ? Math.min(120, W * 0.17) : 6
    const x1 = showLabels ? W - Math.min(150, W * 0.2) : W - 6
    const ys = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => H * (n === 1 ? 0.5 : 0.16 + (0.68 * i) / (n - 1))
      )
    const yl = ys(clients.length)
    const yr = ys(Math.max(1, models.length))
    laneL = yl.map((y) => {
      const ey = cy + (y - cy) * 0.28
      const ex = cx - R * 1.1
      return [
        [x0, y],
        [x0 + (ex - x0) * 0.55, y],
        [x0 + (ex - x0) * 0.45, ey],
        [ex, ey],
      ]
    })
    laneR = yr.map((y) => {
      const sy = cy + (y - cy) * 0.28
      const sx = cx + R * 1.1
      return [
        [sx, sy],
        [sx + (x1 - sx) * 0.55, sy],
        [sx + (x1 - sx) * 0.45, y],
        [x1, y],
      ]
    })
    rails = new Uint8Array(cols * rows)
    const mark = (p: Lane, v: number) => {
      for (let t = 0; t <= 1; t += 0.004) {
        const q = bezier(p, t)
        const c = Math.round(q[0] / cw)
        const r = Math.round(q[1] / ch - 0.5)
        if (
          c >= 0 &&
          c < cols &&
          r >= 0 &&
          r < rows &&
          rails[r * cols + c] < v
        ) {
          rails[r * cols + c] = v
        }
      }
    }
    laneL.forEach((p, i) => mark(p, i === selClient ? 2 : 1))
    laneR.forEach((p, i) => mark(p, i === selModel ? 2 : 1))

    if (labelLayer) {
      labelLayer.replaceChildren()
      if (showLabels) {
        const label = (
          text: string,
          side: 'left' | 'right',
          top: number,
          on: boolean
        ) => {
          const span = document.createElement('span')
          span.textContent = text
          span.style[side] = '8px'
          span.style.top = `${top}px`
          span.dataset.on = on ? 'true' : 'false'
          span.dataset.side = side
          labelLayer.append(span)
        }
        clients.forEach((name, i) =>
          label(name, 'left', yl[i], i === selClient)
        )
        models.forEach((name, i) => label(name, 'right', yr[i], i === selModel))
      }
    }
    for (const p of parts) {
      if (p.side === 1 && p.lane >= models.length) p.lane = pickR()
    }
    if (!parts.length) {
      for (let i = 0; i < (options.labels ? 7 : 5); i++) {
        parts.push(newPart(Math.random()))
      }
    }
    return true
  }

  function frame(time: number) {
    if (!ctx) return
    const t = time / 1000
    const n = cols * rows
    if (buf.length !== n) {
      buf = Array.from({ length: n }, () => '')
      col = Array.from({ length: n }, () => 0)
    }
    for (let i = 0; i < n; i++) {
      buf[i] = ''
      col[i] = 0
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v =
          Math.sin(c * 0.13 + t * 0.5) * Math.sin(r * 0.31 - t * 0.35) +
          Math.sin((c + r * 2) * 0.05 + t * 0.25)
        if (v > 1.1) {
          const k = r * cols + c
          buf[k] = RAMP[1 + Math.min(3, Math.floor((v - 1.1) * 6))]
          col[k] = 1
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (rails[i]) {
        buf[i] = '·'
        col[i] = rails[i] === 2 ? 9 : 2
      }
    }
    for (let i = 0; i < n; i++) {
      const m = mask[i]
      const rg = ring[i]
      if (m > 0.3) {
        const rr = Math.floor(i / cols)
        const cc = i % cols
        const b = m * (0.7 + 0.3 * Math.sin(t * 2.2 - (cc + rr) * 0.22))
        buf[i] = RAMP[Math.min(9, 3 + Math.floor(b * 6.9))]
        col[i] = 3
      } else if (rg > 0.3) {
        buf[i] = RAMP[Math.min(9, 4 + Math.floor(rg * 5.9))]
        col[i] = pulse > 0.15 ? 5 : 4
      }
    }
    for (const p of parts) {
      p.t += reduce ? 0 : p.v
      if (p.t >= 1) {
        if (p.side === 0) {
          p.side = 1
          p.t = 0
          p.lane = p.tmp && selModel >= 0 ? selModel : pickR()
          pulse = 1
        } else if (p.tmp) {
          p.dead = true
          continue
        } else {
          Object.assign(p, newPart(0))
        }
      }
      if (p.t < 0) continue
      const path = p.side ? laneR[p.lane] : laneL[p.lane]
      if (!path) continue
      const q = bezier(path, p.t)
      const hc = Math.round(q[0] / cw)
      const r2 = Math.round(q[1] / ch - 0.5)
      const L = p.txt.length
      for (let j = 0; j < L; j++) {
        const c2 = hc - (L - 1 - j)
        if (
          c2 >= 0 &&
          c2 < cols &&
          r2 >= 0 &&
          r2 < rows &&
          mask[r2 * cols + c2] < 0.3 &&
          ring[r2 * cols + c2] < 0.3
        ) {
          const k2 = r2 * cols + c2
          buf[k2] = p.txt[j]
          col[k2] = p.side ? 6 : 7
        }
      }
    }
    parts = parts.filter((p) => !p.dead)
    pulse *= 0.93
    if (mouse.c > -50) {
      const rad = 6
      for (
        let r = Math.max(0, mouse.r - rad);
        r < Math.min(rows, mouse.r + rad + 1);
        r++
      ) {
        for (
          let c = Math.max(0, mouse.c - rad * 2);
          c < Math.min(cols, mouse.c + rad * 2 + 1);
          c++
        ) {
          const dx = (c - mouse.c) / 2
          const dy = r - mouse.r
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < rad && Math.random() < 1 - d / rad) {
            const k3 = r * cols + c
            buf[k3] = GLITCH[Math.floor(Math.random() * GLITCH.length)]
            col[k3] = d < rad * 0.4 ? 6 : 8
          }
        }
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'top'
    for (let ci = 1; ci < COLORS.length; ci++) {
      ctx.fillStyle = COLORS[ci] as string
      for (let i = 0; i < n; i++) {
        if (col[i] === ci && buf[i] && buf[i] !== ' ') {
          ctx.fillText(buf[i], (i % cols) * cw, Math.floor(i / cols) * ch)
        }
      }
    }
  }

  function loop(time: number) {
    if (!running) return
    if (time - last > 33) {
      last = time
      frame(time)
    }
    requestAnimationFrame(loop)
  }
  function start() {
    if (running || reduce || !ready || !visible || document.hidden) return
    running = true
    requestAnimationFrame(loop)
  }
  function stop() {
    running = false
  }
  function refresh() {
    if (setup()) {
      ready = true
      frame(performance.now())
      start()
    }
  }

  const onMove = (ev: PointerEvent) => {
    if (!ready) return
    const b = canvas.getBoundingClientRect()
    mouse.c = Math.floor((ev.clientX - b.left) / cw)
    mouse.r = Math.floor((ev.clientY - b.top) / ch)
    if (reduce) frame(performance.now())
  }
  const onLeave = () => {
    mouse.c = -99
    if (reduce && ready) frame(performance.now())
  }
  const onVisibility = () => (document.hidden ? stop() : start())
  let resizeTimer = 0
  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(refresh, 120)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', onResize)
  let observer: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false
      if (visible) {
        if (!ready) refresh()
        start()
      } else {
        stop()
      }
    })
    observer.observe(canvas)
  } else {
    visible = true
  }

  return {
    refresh,
    burst() {
      const train = [
        'peroai init',
        'POST /v1',
        'sk-new',
        '200 OK',
        '{"model":',
        'ready',
      ]
      for (let i = 0; i < 8; i++) {
        parts.push({
          side: 0,
          lane: selClient >= 0 ? selClient : 0,
          t: -i * 0.07,
          v: 0.024,
          txt: train[i % train.length],
          tmp: true,
        })
      }
    },
    select(client, nextModels, model) {
      selClient = client
      if (nextModels.length) models = nextModels
      selModel = model
      if (ready) {
        setup()
        frame(performance.now())
      }
    },
    destroy() {
      stop()
      observer?.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(resizeTimer)
    },
  }
}
