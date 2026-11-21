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
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { prefersReducedMotion } from './lib'
import { createSonar, type SonarHandle } from './sonar-engine'

/**
 * Decorative page backdrop: the sonar relay (see sonar-engine.ts) over a
 * faint grid that fades out from the top. Hidden from assistive tech and
 * never takes the pointer.
 */
export function SonarBackdrop(props: { paused?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handle = useRef<SonarHandle | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.getContext !== 'function') return
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas.getContext('2d')
    } catch {
      context = null
    }
    if (!context) return
    const sonar = createSonar(canvas, { reducedMotion: prefersReducedMotion() })
    handle.current = sonar
    sonar.refresh()
    return () => {
      sonar.destroy()
      handle.current = null
    }
  }, [])

  useEffect(() => {
    handle.current?.setPaused(Boolean(props.paused))
  }, [props.paused])

  return (
    <div
      aria-hidden='true'
      className={cn('pointer-events-none overflow-hidden', props.className)}
    >
      <div className='t-backdrop-grid absolute inset-0' />
      <canvas ref={canvasRef} className='absolute inset-0 block size-full' />
    </div>
  )
}
