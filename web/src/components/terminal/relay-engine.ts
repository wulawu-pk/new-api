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
 * ASCII relay animation (the "线路" background on the sign-in pages):
 * requests travel from clients on the left, through the peroai ring in the
 * middle, to models on the right. Ported from the beta landing page
 * (deploy/site/beta/index.html) so both look identical.
 *
 * Under the characters is a rippling water surface (a 2D wave equation).
 * A request leaves a wake along its lane and sets off a ring where it
 * enters the hub; the pointer leaves ripples, a click drops one, and a new
 * selection gives the hub a nudge. Brightness and colour follow the wave
 * continuously (25 steps), so characters fade in and out rather than
 * popping, and the edges fade to nothing.
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
  /** Share of the lane covered per second. */
  v: number
  txt: string
  w: number | null
  x: number | null
  y: number
  tmp?: boolean
  dead?: boolean
}
type Surface = {
  w: number
  h: number
  width: number
  height: number
  cell: number
  prev: Float32Array
  cur: Float32Array
  next: Float32Array
  mask: Float32Array
  energy: number
}

export type RelayOptions = {
  /** Draw client and model labels at the lane ends (needs ≥520px width). */
  labels?: boolean
  /**
   * Quiet mode for a page backdrop: no P and ring where the lanes meet and
   * no text on the requests. Cards cover the middle, so only scraps of the
   * P would show, and the moving text would run under page titles.
   */
  backdrop?: boolean
  clients?: string[]
  models?: string[]
  reducedMotion?: boolean
}

export type RelayHandle = {
  refresh: () => void
  /** Sends a quick train of requests through the selected lane. */
  burst: () => void
  select: (client: number, models: string[], model: number) => void
  /** Holds the animation on its current frame (true) or lets it run again. */
  setPaused: (paused: boolean) => void
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
const PALETTE = '·.:-=+*%#@'
const LOGO = ' .:-=+*#%@'
const STEPS = 24
/** Water steps per second; independent of the display's frame rate. */
const STEP = 1 / 90
/** At most ~60 drawn frames a second, also on 120/144 Hz screens. */
const MIN_FRAME_MS = 1000 / 62
/** Above this many CSS pixels (about 1200×750) the water is sampled more
 * coarsely: a full-screen canvas otherwise costs most of a frame. */
const LARGE_AREA = 900_000

// Wave constants (speed, viscosity, damping, pull back to flat).
const C2 = 0.02 + 0.55 * 0.4
const VISC = Math.min(0.49 - C2, 0.4 * 0.12)
const KEEP = 1 - 0.045
const REST = 1 - 0.004

type Rgb = [number, number, number]
const DIM: Rgb = [141, 146, 156]
const FG: Rgb = [236, 234, 230]
const PINK: Rgb = [255, 122, 182]
function rgba(a: Rgb, b: Rgb, t: number, alpha: number): string {
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `rgba(${mix(0)},${mix(1)},${mix(2)},${alpha.toFixed(3)})`
}
// Crests lean pink, troughs lean white; at zero both equal the base dim.
const CREST = Array.from({ length: STEPS + 1 }, (_, i) =>
  rgba(DIM, PINK, i / STEPS, 0.14 + (0.86 * i) / STEPS)
)
const TROUGH = Array.from({ length: STEPS + 1 }, (_, i) =>
  rgba(DIM, FG, i / STEPS, 0.14 + (0.86 * i) / STEPS)
)
const LOGO_COLORS = Array.from({ length: 9 }, (_, i) =>
  rgba(FG, FG, 0, 0.55 + (0.45 * i) / 8)
)
const RING_COLORS = Array.from({ length: 9 }, (_, i) =>
  rgba(FG, PINK, i / 8, 0.5 + (0.5 * i) / 8)
)
const FIELD_COLORS = Array.from({ length: 6 }, (_, i) =>
  rgba(DIM, DIM, 0, 0.04 + (0.2 * i) / 5)
)
const RAIL = 'rgba(141,146,156,.38)'
const RAIL_ON = 'rgba(255,122,182,.5)'

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

function hash(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return n - Math.floor(n)
}

/** A surface with an absorbing border, so ripples fade at the edges. */
function createSurface(width: number, height: number, cell: number): Surface {
  const w = Math.ceil(width / cell) + 2
  const h = Math.ceil(height / cell) + 2
  const size = w * h
  const mask = new Float32Array(size)
  const band = Math.max(3, Math.round(Math.min(w, h) * 0.08))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y)
      const k = d < band ? 1 - (1 - d / band) * (1 - d / band) * 0.22 : 1
      mask[y * w + x] = k
    }
  }
  return {
    w,
    h,
    width,
    height,
    cell,
    prev: new Float32Array(size),
    cur: new Float32Array(size),
    next: new Float32Array(size),
    mask,
    energy: 0,
  }
}

function stepSurface(s: Surface) {
  const { w, h, prev, cur, next, mask } = s
  const k = C2 + VISC
  let energy = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      const c = cur[i]
      const v =
        c * REST +
        (c - prev[i]) * KEEP * mask[i] +
        k * (cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w] - 4 * c)
      next[i] = v
      const a = v < 0 ? -v : v
      if (a > energy) energy = a
    }
  }
  s.prev = cur
  s.cur = next
  s.next = prev
  s.energy = energy
}

/** Pushes the surface down in a smooth disc around (px, py). */
function disturb(s: Surface, px: number, py: number, rad: number, amt: number) {
  const cx = px / s.cell + 1
  const cy = py / s.cell + 1
  const r = Math.max(1, rad / s.cell)
  const inv = 1 / (r * r)
  const y1 = Math.min(s.h - 2, Math.ceil(cy + r))
  const x1 = Math.min(s.w - 2, Math.ceil(cx + r))
  for (let y = Math.max(1, Math.floor(cy - r)); y <= y1; y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      const q = 1 - (dx * dx + dy * dy) * inv
      if (q > 0) s.cur[y * s.w + x] -= amt * q * q * (3 - 2 * q)
    }
  }
  if (s.energy < amt) s.energy = amt
}

/** Height and slope at (px, py), bilinear. Writes [h, gx, gy] into `out`. */
function sampleSurface(s: Surface, px: number, py: number, out: number[]) {
  const fx = px / s.cell + 1
  const fy = py / s.cell + 1
  const x = Math.min(s.w - 3, Math.max(1, Math.floor(fx)))
  const y = Math.min(s.h - 3, Math.max(1, Math.floor(fy)))
  const tx = Math.min(1, Math.max(0, fx - x))
  const ty = Math.min(1, Math.max(0, fy - y))
  const { w, cur } = s
  const i = y * w + x
  const top = cur[i] + (cur[i + 1] - cur[i]) * tx
  const bottom = cur[i + w] + (cur[i + w + 1] - cur[i + w]) * tx
  out[0] = top + (bottom - top) * ty
  const gTop = cur[i + 1] - cur[i - 1]
  const gBottom = cur[i + w + 1] - cur[i + w - 1]
  out[1] = (gTop + (gBottom - gTop) * ty) * 0.5
  const gLeft = cur[i + w] - cur[i - w]
  const gRight = cur[i + w + 1] - cur[i - w + 1]
  out[2] = (gLeft + (gRight - gLeft) * tx) * 0.5
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
  let hub = { x: 0, y: 0, R: 0 }
  let glow = 0
  let surface: Surface | null = null
  let ready = false
  let running = false
  let visible = false
  let lastTime = 0
  let paused = false
  let acc = 0
  let lastDrop = -1e9
  let seen = false
  let selClient = -1
  let selModel = -1
  const pointer = { x: 0, y: 0, lx: 0, ly: 0, inside: false, pending: false }
  const sample = [0, 0, 0]

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
    v: 0.078 + Math.random() * 0.06,
    txt: TOKENS[Math.floor(Math.random() * TOKENS.length)],
    w: null,
    x: null,
    y: 0,
  })
  const drop = (x: number, y: number, rad: number, amt: number) => {
    if (surface && !reduce) disturb(surface, x, y, rad, amt)
  }

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
    hub = { x: cx, y: cy, R }

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
    if (options.backdrop) {
      mask.fill(0)
      ring.fill(0)
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
      p.w = null
      if (p.side === 1 && p.lane >= models.length) p.lane = pickR()
    }
    if (!parts.length) {
      for (let i = 0; i < (options.labels ? 7 : 5); i++) {
        parts.push(newPart(Math.random()))
      }
    }
    // Same size (only the selection changed): keep the water and its ripples.
    if (!surface || surface.width !== W || surface.height !== H) {
      surface = createSurface(W, H, W * H > LARGE_AREA ? ch / 2 : ch / 3)
    }
    return true
  }

  /** Moves requests along, leaving wakes; arrivals ripple the hub. */
  function advance(now: number, dt: number) {
    for (const p of parts) {
      if (!reduce) p.t += p.v * dt
      if (p.t >= 1) {
        if (p.side === 0) {
          // Lanes meet at the hub's entrance; when arrivals come close
          // together, only the ring glows instead of piling ripples there.
          const lane = laneL[p.lane]
          if (lane && now - lastDrop > 700) {
            drop(lane[3][0], lane[3][1], hub.R * 0.35, 0.16)
            lastDrop = now
          }
          glow = 1
          p.side = 1
          p.t = 0
          p.lane = p.tmp && selModel >= 0 ? selModel : pickR()
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
      p.x = q[0]
      p.y = q[1]
      // The wake fades out near the hub, where all lanes run together.
      const taper = Math.max(
        0,
        Math.min(1, p.side ? p.t / 0.3 : (1 - p.t) / 0.3)
      )
      const strength = (p.tmp ? 0.03 : 0.009) * taper
      drop(q[0], q[1], 8, strength * Math.min(3, dt * 60))
    }
    parts = parts.filter((p) => !p.dead)

    if (pointer.pending) {
      const dx = pointer.x - pointer.lx
      const dy = pointer.y - pointer.ly
      const moved = Math.sqrt(dx * dx + dy * dy)
      if (moved > 0.5) {
        const n = Math.min(6, Math.max(1, Math.ceil(moved / 16)))
        const amt = (0.16 * Math.min(1, moved / 24)) / n
        for (let i = 1; i <= n; i++) {
          drop(pointer.lx + (dx * i) / n, pointer.ly + (dy * i) / n, 16, amt)
        }
      }
      pointer.lx = pointer.x
      pointer.ly = pointer.y
      pointer.pending = false
    }

    if (surface && !reduce) {
      acc += dt
      let n = 0
      while (acc >= STEP && n < 4) {
        stepSurface(surface)
        acc -= STEP
        n++
      }
      if (n === 4) acc = 0
    }
    glow *= Math.exp(-dt * 2.2)
  }

  /** Picks each cell's glyph and colour, then draws same-colour runs. */
  function drawField(now: number) {
    if (!ctx || !surface) return
    const t = now / 1000
    const groups = new Map<string, number[]>()
    const glyphs: string[] = []
    const active = surface.energy > 0.0015 && !reduce
    const seed = Math.floor(now / 90)
    for (let r = 0; r < rows; r++) {
      const y = r * ch + ch / 2
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const x = c * cw
        let glyph = ''
        let color = ''
        let solid = false
        if (mask[k] > 0.3) {
          const b = mask[k] * (0.75 + 0.25 * Math.sin(t * 2 - (c + r) * 0.22))
          glyph = LOGO[Math.min(9, 3 + Math.floor(b * 6.9))]
          color = LOGO_COLORS[Math.min(8, Math.round(b * 8))]
          solid = true
        } else if (ring[k] > 0.3) {
          glyph = LOGO[Math.min(9, 4 + Math.floor(ring[k] * 5.9))]
          color = RING_COLORS[Math.round(glow * 8)]
          solid = true
        } else if (rails[k]) {
          glyph = '·'
          color = rails[k] === 2 ? RAIL_ON : RAIL
        } else {
          // Slowly drifting clouds whose opacity changes continuously.
          const v =
            Math.sin(c * 0.13 + t * 0.5) * Math.sin(r * 0.31 - t * 0.35) +
            Math.sin((c + r * 2) * 0.05 + t * 0.25)
          const a = Math.min(1, (v - 0.55) / 1.2)
          if (a > 0) {
            glyph = PALETTE[1 + Math.floor(a * 3.99)]
            color = FIELD_COLORS[Math.round(a * 5)]
          }
        }
        if (active) {
          sampleSurface(surface, x + cw / 2, y, sample)
          const gx = sample[1] * 3
          const gy = sample[2] * 3
          const height = sample[0] < 0 ? -sample[0] : sample[0]
          let level =
            (height * 2.2 + Math.sqrt(gx * gx + gy * gy) - 0.12) * 1.14
          if (level > 0.02 && (!solid || level > 0.45)) {
            // Capped at .85: the brightest ripple is %#, never a wall of @.
            level = Math.min(0.85, level * 0.85)
            if (!glyph || level >= 0.5 + (hash(c, r, 0) - 0.5) * 0.5) {
              const jitter = (hash(c, r, seed) - 0.5) * 2.7
              glyph =
                PALETTE[
                  Math.max(0, Math.min(9, Math.round(level * 9 + jitter)))
                ]
            }
            color = (sample[0] >= 0 ? CREST : TROUGH)[Math.round(level * STEPS)]
          }
        }
        if (!glyph || glyph === ' ') continue
        let run = groups.get(color)
        if (!run) {
          run = []
          groups.set(color, run)
        }
        run.push(glyphs.length, x, y)
        glyphs.push(glyph)
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (const [color, run] of groups) {
      ctx.fillStyle = color
      for (let i = 0; i < run.length; i += 3) {
        ctx.fillText(glyphs[run[i]], run[i + 1], run[i + 2])
      }
    }
  }

  /**
   * Requests: a bright dot moving continuously. Its text shows only where
   * the lanes are apart (fading out before the hub and back in after it)
   * and is skipped where it would overlap one already drawn.
   */
  function drawRequests() {
    if (!ctx) return
    const drawn: [number, number, number, number][] = []
    for (const p of parts) {
      if (p.t < 0 || p.x === null) continue
      const edge = Math.min(1, p.t / 0.06, (1 - p.t) / 0.06)
      if (edge <= 0) continue
      const hot = p.side ? '255,122,182' : '236,234,230'
      ctx.globalAlpha = edge
      ctx.fillStyle = `rgba(${hot},.22)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgb(${hot})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
      ctx.fill()
      if (options.backdrop) continue
      const fade = p.side
        ? Math.min((p.t - 0.22) / 0.14, (1 - p.t) / 0.12)
        : Math.min(p.t / 0.1, (0.62 - p.t) / 0.14)
      const alpha = Math.min(1, fade)
      if (alpha <= 0) continue
      if (p.w === null) p.w = ctx.measureText(p.txt).width
      const tx = p.x - p.w - 9
      const box: [number, number, number, number] = [
        tx - 4,
        p.y - ch / 2,
        p.w + 8,
        ch,
      ]
      const overlaps = drawn.some(
        (o) =>
          box[0] < o[0] + o[2] &&
          o[0] < box[0] + box[2] &&
          box[1] < o[1] + o[3] &&
          o[1] < box[1] + box[3]
      )
      if (overlaps) continue
      drawn.push(box)
      // Clear a clean patch behind the text, then write it.
      ctx.globalAlpha = alpha
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      ctx.fillRect(box[0], box[1], box[2], box[3])
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = p.side ? '#FF7AB6' : '#ECEAE6'
      ctx.fillText(p.txt, tx, p.y)
    }
    ctx.globalAlpha = 1
  }

  function fadeEdges() {
    if (!ctx) return
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    const fade = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(0.35, 'rgba(0,0,0,.55)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
    const bx = Math.min(56, W * 0.07)
    const by = Math.min(28, H * 0.1)
    fade(0, 0, bx, 0)
    fade(W, 0, W - bx, 0)
    fade(0, 0, 0, by)
    fade(0, H, 0, H - by)
    ctx.restore()
  }

  function frame(now: number, dt: number) {
    if (!ctx || !surface) return
    advance(now, dt)
    drawField(now)
    drawRequests()
    fadeEdges()
  }

  function loop(now: number) {
    if (!running) return
    if (now - lastTime >= MIN_FRAME_MS) {
      const dt = Math.min(0.1, (now - lastTime) / 1000 || 0)
      lastTime = now
      frame(now, dt)
    }
    requestAnimationFrame(loop)
  }
  function start() {
    if (running || paused || reduce || !ready || !visible || document.hidden) {
      return
    }
    running = true
    lastTime = performance.now()
    requestAnimationFrame(loop)
  }
  function stop() {
    running = false
  }
  function refresh() {
    if (setup()) {
      ready = true
      frame(performance.now(), 0)
      start()
    }
  }

  const local = (ev: PointerEvent): Point => {
    const b = canvas.getBoundingClientRect()
    return [ev.clientX - b.left, ev.clientY - b.top]
  }
  const onMove = (ev: PointerEvent) => {
    if (!ready || reduce) return
    const [x, y] = local(ev)
    if (!pointer.inside) {
      pointer.lx = x
      pointer.ly = y
      pointer.inside = true
    }
    pointer.x = x
    pointer.y = y
    pointer.pending = true
  }
  const onLeave = () => {
    pointer.inside = false
    pointer.pending = false
  }
  const onDown = (ev: PointerEvent) => {
    if (!ready) return
    const [x, y] = local(ev)
    drop(x, y, 24, 0.7)
  }
  const onVisibility = () => (document.hidden ? stop() : start())
  let resizeTimer = 0
  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(refresh, 120)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerdown', onDown)
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
          v: 0.72,
          txt: train[i % train.length],
          w: null,
          x: null,
          y: 0,
          tmp: true,
        })
      }
    },
    select(client, nextModels, model) {
      selClient = client
      if (nextModels.length) models = nextModels
      selModel = model
      if (!ready) return
      setup()
      // A new selection: the hub gives a small ripple.
      if (seen) drop(hub.x, hub.y, hub.R * 0.8, 0.28)
      seen = true
      frame(performance.now(), 0)
    },
    setPaused(next) {
      paused = next
      if (paused) stop()
      else start()
    },
    destroy() {
      stop()
      observer?.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(resizeTimer)
    },
  }
}
