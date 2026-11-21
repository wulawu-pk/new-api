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
 * Sonar relay: the page backdrop of the console (and, as inline script, of
 * the beta landing page). Two backgrounds fused: the glyph field of the
 * refactor/ui-v4 landing page (a grid of · + × ○ ◎ ◉ where drifting clusters
 * glow faintly) and the relay of the v3 sign-in page (lanes carrying
 * requests from the clients into api.peroai.cc and out to the models).
 * Each request that reaches the hub sends a sonar ring through the field,
 * lighting the clusters it passes in the accent colour; when no request has
 * arrived for a while the hub pings on its own. Written on a 2D canvas (the
 * v4 one is a licensed WebGL component, not reused).
 *
 * Cheap by construction: glyphs come from a pre-drawn atlas (drawImage, no
 * fillText per frame), cells below a small energy are skipped, and frames
 * are capped at 30 per second. Stops off screen and in background tabs;
 * reduced motion draws one still frame.
 */

type Rgb = [number, number, number]

export type SonarOptions = {
  reducedMotion?: boolean
  /** Where the rings start, as a fraction of the width / height. */
  originX?: number
  originY?: number
  /** Seconds between rings. */
  interval?: number
  /** Cell size in CSS pixels. */
  cell?: number
}

export type SonarHandle = {
  refresh: () => void
  /** Holds the current frame (true) or lets it run again. */
  setPaused: (paused: boolean) => void
  destroy: () => void
}

const GLYPHS = ['', '·', '+', '×', '○', '◎', '◉']
const LEVELS = 6
const FRAME_MS = 33
const FG: Rgb = [241, 240, 236]
const DIM: Rgb = [120, 122, 126]
/** Accent when the page sets none: mint #3DDBA5, as in theme-presets.css. */
const DEFAULT_ACCENT: Rgb = [61, 219, 165]
/** Ring speed and reach, as fractions of the canvas diagonal. */
const RING_SPEED = 0.17
const RING_REACH = 0.8
/** A request arriving sooner than this after the last ring adds none. */
const MIN_RING_GAP = 900
const LANES = 4
const PACKETS = 5

type Point = [number, number]
type Lane = [Point, Point, Point, Point]
type Packet = { side: 0 | 1; lane: number; t: number; v: number }

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

/** The page accent as RGB, read from --t-accent-rgb ("61 219 165"). */
export function readAccentRgb(el: Element): Rgb {
  const raw = getComputedStyle(el).getPropertyValue('--t-accent-rgb').trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return DEFAULT_ACCENT
  }
  return [parts[0], parts[1], parts[2]]
}

function mix(a: Rgb, b: Rgb, t: number): string {
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `${c(0)},${c(1)},${c(2)}`
}

/*
 * The drifting clusters are sums of sines (smooth, no visible tiling):
 *   sin(c·.21 + t·.32)·sin(r·.37 − t·.24) + .8·sin((c + 1.7r)·.09 + t·.16)
 * Each term is split with sin(a ± b) = sin a cos b ± cos a sin b, so the
 * per-cell sines are computed once in setup and a frame only multiplies.
 */
const KC = 0.21
const KR = 0.37
const KD = 0.09

export function createSonar(
  canvas: HTMLCanvasElement,
  options: SonarOptions = {}
): SonarHandle {
  const ctx = canvas.getContext('2d')
  const reduce = options.reducedMotion ?? false
  let cell = options.cell ?? 18
  const interval = (options.interval ?? 3.4) * 1000
  const originX = options.originX ?? 0.5
  const originY = options.originY ?? 0.3
  const accent = readAccentRgb(canvas)
  let W = 0
  let H = 0
  let cols = 0
  let rows = 0
  let weight = new Float32Array(0)
  // Per-cell constants: distance to the hub and the sines of the cluster terms.
  let dist = new Float32Array(0)
  let sinC = new Float32Array(0)
  let cosC = new Float32Array(0)
  let sinR = new Float32Array(0)
  let cosR = new Float32Array(0)
  let sinD = new Float32Array(0)
  let cosD = new Float32Array(0)
  let atlas: HTMLCanvasElement | null = null
  let tile = 0
  let pings: number[] = []
  let nextPing = 0
  let lanesIn: Lane[] = []
  let lanesOut: Lane[] = []
  let rails = new Float32Array(0)
  let boost = new Float32Array(0)
  let packets: Packet[] = []
  let lastStep = 0
  let ready = false
  let running = false
  let visible = false
  let paused = false
  let raf = 0
  let last = 0

  /** Every glyph at every brightness, in a dim and an accent tint. */
  function buildAtlas(dpr: number): boolean {
    tile = Math.ceil(cell * dpr)
    const sheet = document.createElement('canvas')
    sheet.width = tile * GLYPHS.length
    sheet.height = tile * LEVELS * 2
    const o = sheet.getContext('2d')
    if (!o) return false
    o.textAlign = 'center'
    o.textBaseline = 'middle'
    o.font = `${Math.round(cell * 0.62 * dpr)}px ui-monospace, "SF Mono", Consolas, monospace`
    for (let tint = 0; tint < 2; tint++) {
      for (let level = 0; level < LEVELS; level++) {
        const k = (level + 1) / LEVELS
        const rgb = tint
          ? mix(FG, accent, 0.35 + 0.65 * k)
          : mix(DIM, FG, k * 0.6)
        o.fillStyle = `rgba(${rgb},${(0.1 + 0.9 * k).toFixed(3)})`
        for (let g = 1; g < GLYPHS.length; g++) {
          o.fillText(
            GLYPHS[g],
            g * tile + tile / 2,
            (tint * LEVELS + level) * tile + tile / 2
          )
        }
      }
    }
    atlas = sheet
    return true
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
    // Larger cells on wide screens keep the cell count (and the cost) flat.
    cell = options.cell ?? (W > 1800 ? 22 : 18)
    cols = Math.ceil(W / cell) + 1
    rows = Math.ceil(H / cell) + 1
    // Fade out towards the edges: an ellipse around the upper middle.
    weight = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = (c * cell - W * 0.5) / (W * 0.62)
        const dy = (r * cell - H * 0.42) / (H * 0.7)
        const d = Math.sqrt(dx * dx + dy * dy)
        weight[r * cols + c] = Math.max(0, Math.min(1, (1 - d) / 0.45))
      }
    }
    const hubX = W * originX
    const hubY = H * originY
    dist = new Float32Array(cols * rows)
    sinD = new Float32Array(cols * rows)
    cosD = new Float32Array(cols * rows)
    sinC = Float32Array.from({ length: cols }, (_, c) => Math.sin(c * KC))
    cosC = Float32Array.from({ length: cols }, (_, c) => Math.cos(c * KC))
    sinR = Float32Array.from({ length: rows }, (_, r) => Math.sin(r * KR))
    cosR = Float32Array.from({ length: rows }, (_, r) => Math.cos(r * KR))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const x = c * cell + (r % 2 ? cell / 2 : 0)
        dist[k] = Math.hypot(x - hubX, r * cell - hubY)
        sinD[k] = Math.sin((c + r * 1.7) * KD)
        cosD[k] = Math.cos((c + r * 1.7) * KD)
      }
    }
    // Lanes: clients on the left into the hub, the hub out to the models on
    // the right (as on the sign-in page), drawn as faint dotted rails.
    const ox = W * originX
    const oy = H * originY
    const span = Math.min(W * 0.36, 560)
    const ys = Array.from(
      { length: LANES },
      (_, i) => oy + (i - (LANES - 1) / 2) * Math.min(H * 0.16, 120)
    )
    lanesIn = ys.map((y): Lane => [
      [ox - span, y],
      [ox - span * 0.45, y],
      [ox - span * 0.4, oy],
      [ox - cell, oy],
    ])
    lanesOut = ys.map((y): Lane => [
      [ox + cell, oy],
      [ox + span * 0.4, oy],
      [ox + span * 0.45, y],
      [ox + span, y],
    ])
    rails = new Float32Array(cols * rows)
    boost = new Float32Array(cols * rows)
    for (const lane of [...lanesIn, ...lanesOut]) {
      for (let t = 0; t <= 1; t += 0.004) {
        const k = cellAt(bezier(lane, t))
        if (k >= 0) rails[k] = 1
      }
    }
    if (!packets.length) {
      packets = Array.from({ length: PACKETS }, (_, i) => ({
        side: (i % 2) as 0 | 1,
        lane: i % LANES,
        t: Math.random(),
        v: 0.18 + Math.random() * 0.12,
      }))
    }
    return buildAtlas(dpr)
  }

  /** The cell under a point (odd rows sit half a cell to the right). */
  function cellAt(p: Point): number {
    const r = Math.round(p[1] / cell)
    const c = Math.round((p[0] - (r % 2 ? cell / 2 : 0)) / cell)
    if (r < 0 || r >= rows || c < 0 || c >= cols) return -1
    return r * cols + c
  }

  /** Moves the requests; one reaching the hub sends a ring out. */
  function stepPackets(now: number) {
    const dt = lastStep ? Math.min(0.1, (now - lastStep) / 1000) : 0
    lastStep = now
    boost.fill(0)
    for (const p of packets) {
      if (!reduce) p.t += p.v * dt
      if (p.t >= 1) {
        if (p.side === 0) {
          if (now - (pings.at(-1) ?? -Infinity) > MIN_RING_GAP) {
            pings.push(now)
            nextPing = now + interval
          }
          p.side = 1
          p.lane = Math.floor(Math.random() * LANES)
        } else {
          p.side = 0
          p.lane = Math.floor(Math.random() * LANES)
          p.v = 0.18 + Math.random() * 0.12
        }
        p.t = 0
      }
      const lane = (p.side ? lanesOut : lanesIn)[p.lane]
      if (!lane) continue
      // A bright head and a short tail behind it.
      for (let j = 0; j < 7; j++) {
        const tt = p.t - j * 0.018
        if (tt < 0) break
        const k = cellAt(bezier(lane, tt))
        if (k >= 0) boost[k] = Math.max(boost[k], 1 - j / 7)
      }
    }
  }

  function draw(now: number) {
    if (!ctx || !atlas) return
    const t = now / 1000
    const diag = Math.hypot(W, H)
    const speed = diag * RING_SPEED
    const life = (diag * RING_REACH) / speed
    stepPackets(now)
    if (!reduce && now >= nextPing) {
      pings.push(now)
      nextPing = now + interval
    }
    pings = pings.filter((p) => (now - p) / 1000 < life)
    const band = cell * 2.4
    const wake = band * 7
    const radii = pings.map((p) => ((now - p) / 1000) * speed)
    const fades = pings.map((p) => 1 - (now - p) / 1000 / life)
    const s1 = Math.sin(t * 0.32)
    const c1 = Math.cos(t * 0.32)
    const s2 = Math.sin(t * 0.24)
    const c2 = Math.cos(t * 0.24)
    const s3 = Math.sin(t * 0.16)
    const c3 = Math.cos(t * 0.16)
    ctx.clearRect(0, 0, W, H)
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? cell / 2 : 0
      const rowWave = sinR[r] * c2 - cosR[r] * s2
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const w = weight[k]
        if (w < 0.02 && boost[k] === 0) continue
        const x = c * cell + shift
        const y = r * cell
        const v =
          (sinC[c] * c1 + cosC[c] * s1) * rowWave +
          (sinD[k] * c3 + cosD[k] * s3) * 0.8
        const base = Math.max(0, Math.min(1, (v - 0.5) * 1.05))
        let crest = 0
        let trail = 0
        for (let i = 0; i < radii.length; i++) {
          const ahead = radii[i] - dist[k]
          if (ahead > -band && ahead < band) {
            crest = Math.max(crest, (1 - Math.abs(ahead) / band) * fades[i])
          } else if (ahead >= band && ahead < wake) {
            trail = Math.max(trail, (1 - ahead / wake) * fades[i])
          }
        }
        // Clusters glow faintly on their own; a passing ring lights them
        // up and draws itself faintly across empty cells too.
        const field =
          w * (base * (0.6 + 0.9 * crest + 0.5 * trail) + crest * 0.32)
        // Rails show as faint dots; a request is the brightest thing there.
        const lane = Math.max(rails[k] * 0.16 * Math.max(w, 0.5), boost[k])
        const energy = Math.max(field, lane)
        if (energy < 0.07) continue
        const g =
          boost[k] > 0 || rails[k] > 0
            ? Math.min(GLYPHS.length - 1, 1 + Math.floor(energy * 4.4))
            : Math.min(GLYPHS.length - 1, 1 + Math.floor(energy * 5.2))
        const level = Math.min(LEVELS - 1, Math.floor(energy * LEVELS))
        const tint = boost[k] > 0.3 || crest > 0.25 || base * w > 0.5 ? 1 : 0
        ctx.drawImage(
          atlas,
          g * tile,
          (tint * LEVELS + level) * tile,
          tile,
          tile,
          x - cell / 2,
          y - cell / 2,
          cell,
          cell
        )
      }
    }
  }

  function loop(now: number) {
    if (!running) return
    if (now - last >= FRAME_MS) {
      last = now
      draw(now)
    }
    raf = window.requestAnimationFrame(loop)
  }
  function start() {
    if (running || reduce || paused || !ready || !visible || document.hidden) {
      return
    }
    running = true
    raf = window.requestAnimationFrame(loop)
  }
  function stop() {
    running = false
    window.cancelAnimationFrame(raf)
  }
  function refresh() {
    if (!setup()) return
    ready = true
    const now = performance.now()
    // A still frame shows one ring half way out.
    if (reduce) pings = [now - interval * 0.6]
    draw(now)
    start()
  }

  const onVisibility = () => (document.hidden ? stop() : start())
  let resizeTimer = 0
  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(refresh, 120)
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', onResize)
  let observer: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false
      if (!visible) {
        stop()
        return
      }
      if (!ready) refresh()
      start()
    })
    observer.observe(canvas)
  } else {
    visible = true
  }

  return {
    refresh,
    setPaused(next) {
      paused = next
      if (paused) stop()
      else start()
    },
    destroy() {
      stop()
      window.clearTimeout(resizeTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    },
  }
}
