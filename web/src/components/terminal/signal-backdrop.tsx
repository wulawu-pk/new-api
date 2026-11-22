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
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { prefersReducedMotion } from './lib'
import { createSignal } from './signal-engine'

/**
 * Decorative backdrop for reading pages: the signal grid (see
 * signal-engine.ts), which only moves while the reader scrolls, points or
 * clicks. Until the canvas runs — or when it cannot — the plain CSS grid
 * shows instead. Hidden from assistive tech and never takes the pointer.
 */
export function SignalBackdrop(props: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.getContext !== 'function') return
    let signal: ReturnType<typeof createSignal> = null
    try {
      signal = createSignal(canvas, {
        reducedMotion: prefersReducedMotion(),
        ignore: '.t-pane',
      })
    } catch {
      signal = null
    }
    if (!signal) return
    setRunning(true)
    return () => {
      signal.destroy()
      setRunning(false)
    }
  }, [])

  return (
    <div
      aria-hidden='true'
      data-backdrop='signal'
      className={cn('pointer-events-none overflow-hidden', props.className)}
    >
      {!running && <div className='t-backdrop-grid absolute inset-0' />}
      <canvas ref={canvasRef} className='absolute inset-0 block size-full' />
    </div>
  )
}
