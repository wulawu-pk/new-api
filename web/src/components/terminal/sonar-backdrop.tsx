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
import { useEffect, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { prefersReducedMotion } from './lib'
import { createSonar, type SonarHandle } from './sonar-engine'

/*
 * One sonar for the whole app. Some console pages (models, status, redeem)
 * render their own ConsoleShell, so switching to or from them unmounts one
 * backdrop and mounts another; a backdrop owning its own canvas restarted the
 * rings from the centre on every such switch, while the pages sharing the
 * authenticated layout kept theirs. The canvas and its engine therefore live
 * at module level: a backdrop that mounts adopts the canvas (moving a canvas
 * keeps its pixels, and the engine carries on in the same time line), and the
 * engine is only destroyed when no backdrop has shown it for a while.
 */
type Host = { el: HTMLDivElement; paused: boolean }

const RELEASE_AFTER_MS = 1500

let shared: { canvas: HTMLCanvasElement; sonar: SonarHandle | null } | null =
  null
let hosts: Host[] = []
let releaseTimer: ReturnType<typeof setTimeout> | undefined

/** The shared canvas; its sonar is null where there is no 2D canvas. */
function acquire(): NonNullable<typeof shared> {
  if (shared) return shared
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 block size-full'
  let context: unknown = null
  if (typeof canvas.getContext === 'function') {
    try {
      context = canvas.getContext('2d')
    } catch {
      context = null
    }
  }
  const sonar = context
    ? createSonar(canvas, { reducedMotion: prefersReducedMotion() })
    : null
  shared = { canvas, sonar }
  return shared
}

/** Puts the canvas in the newest backdrop still mounted. */
function place() {
  if (!shared) return
  const host = hosts.at(-1)
  if (!host) {
    shared.canvas.remove()
    return
  }
  const moved = shared.canvas.parentElement !== host.el
  if (moved) host.el.appendChild(shared.canvas)
  shared.sonar?.setPaused(host.paused)
  if (moved) shared.sonar?.refresh()
}

function scheduleRelease() {
  clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    releaseTimer = undefined
    if (hosts.length || !shared) return
    shared.sonar?.destroy()
    shared.canvas.remove()
    shared = null
  }, RELEASE_AFTER_MS)
}

/**
 * Decorative page backdrop: the sonar relay (see sonar-engine.ts) over a
 * faint grid that fades out from the top. Hidden from assistive tech and
 * never takes the pointer. Every backdrop shows the same running sonar, so
 * moving between pages never restarts it.
 */
export function SonarBackdrop(props: { paused?: boolean; className?: string }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<Host | null>(null)

  // Layout effect: the canvas is in place before the new page paints.
  useLayoutEffect(() => {
    const el = slotRef.current
    if (!el) return
    acquire()
    clearTimeout(releaseTimer)
    releaseTimer = undefined
    const host: Host = { el, paused: false }
    hostRef.current = host
    hosts.push(host)
    place()
    return () => {
      hosts = hosts.filter((h) => h !== host)
      hostRef.current = null
      place()
      if (!hosts.length) scheduleRelease()
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.paused = Boolean(props.paused)
    if (hosts.at(-1) === host) shared?.sonar?.setPaused(host.paused)
  }, [props.paused])

  return (
    <div
      aria-hidden='true'
      className={cn('pointer-events-none overflow-hidden', props.className)}
    >
      <div className='t-backdrop-grid absolute inset-0' />
      <div ref={slotRef} className='absolute inset-0' />
    </div>
  )
}
