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

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SPIN_FRAMES } from './lib'

export type SpinState = 'idle' | 'pending' | 'done'

type SpinButtonProps = Omit<React.ComponentProps<typeof Button>, 'children'> & {
  state: SpinState
  /** Label while idle, e.g. "登录". */
  label: string
  /** Label while pending, e.g. "正在登录". */
  pendingLabel: string
  /** Label once done, e.g. "登录成功". */
  doneLabel?: string
}

/**
 * Submit button for auth forms: while the request runs the label becomes a
 * rotating | / - \ spinner, and on success it fills pink with a ✓.
 * Built on `components/ui/button`; only the label and colours change.
 */
export function SpinButton(props: SpinButtonProps) {
  const { state, label, pendingLabel, doneLabel, className, ...rest } = props
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (state !== 'pending') return
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % SPIN_FRAMES.length),
      90
    )
    return () => window.clearInterval(timer)
  }, [state])

  let text = label
  if (state === 'pending') text = `${SPIN_FRAMES[frame]}  ${pendingLabel}`
  if (state === 'done') text = `✓  ${doneLabel ?? label}`

  return (
    <Button
      aria-disabled={state !== 'idle' ? true : undefined}
      aria-busy={state === 'pending' ? true : undefined}
      className={cn(
        'h-auto w-full rounded-full py-3 text-sm whitespace-pre',
        state === 'idle' &&
          'hover:border-(--t-primary-hover) hover:bg-(--t-primary-hover)',
        state === 'pending' &&
          'border-(--t-accent) text-t-accent cursor-default bg-transparent font-mono hover:bg-transparent',
        state === 'done' &&
          'bg-t-accent border-(--t-accent) text-t-bg cursor-default hover:bg-t-accent',
        className
      )}
      {...rest}
    >
      {text}
    </Button>
  )
}
