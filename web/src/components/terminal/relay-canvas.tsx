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
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { cn } from '@/lib/utils'

import { createRelay, type RelayHandle } from './relay-engine'

type RelayCanvasProps = {
  labels?: boolean
  /** Hold the current frame, e.g. while a transition over it plays. */
  paused?: boolean
  className?: string
}

export type RelayCanvasRef = Pick<RelayHandle, 'burst' | 'select'>

/**
 * Decorative ASCII relay animation (canvas). Hidden from assistive tech;
 * pauses when off screen or in a background tab, and draws one still frame
 * when reduced motion is requested.
 */
export const RelayCanvas = forwardRef<RelayCanvasRef, RelayCanvasProps>(
  function RelayCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const labelRef = useRef<HTMLDivElement>(null)
    const handle = useRef<RelayHandle | null>(null)

    useImperativeHandle(ref, () => ({
      burst: () => handle.current?.burst(),
      select: (client, models, model) =>
        handle.current?.select(client, models, model),
    }))

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
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const relay = createRelay(canvas, labelRef.current, {
        labels: props.labels,
        reducedMotion,
      })
      handle.current = relay
      const ready = document.fonts?.ready
      if (ready) void ready.then(() => relay.refresh())
      else relay.refresh()
      return () => {
        relay.destroy()
        handle.current = null
      }
    }, [props.labels])

    useEffect(() => {
      handle.current?.setPaused(Boolean(props.paused))
    }, [props.paused])

    return (
      <div
        aria-hidden='true'
        className={cn('relative overflow-hidden', props.className)}
      >
        <canvas
          ref={canvasRef}
          className='absolute inset-0 block size-full cursor-crosshair'
        />
        <div
          ref={labelRef}
          className='[&>span]:bg-t-bg/90 [&>span]:text-t-dim [&>span[data-on=true]]:text-t-fg [&>span[data-on=true][data-side=right]]:text-t-pink pointer-events-none absolute inset-0 [&>span]:absolute [&>span]:-translate-y-1/2 [&>span]:rounded-[5px] [&>span]:px-[5px] [&>span]:py-px [&>span]:font-mono [&>span]:text-xs [&>span]:font-medium [&>span]:whitespace-nowrap'
        />
      </div>
    )
  }
)
