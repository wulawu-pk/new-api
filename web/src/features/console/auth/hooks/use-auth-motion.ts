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
import { useCallback, useRef, useState } from 'react'

import type { SpinState } from '@/components/terminal/spin-button'

import { markConsoleCrtOn, prefersReducedMotion } from '../../lib/crt'

const MIN_SPIN_MS = 600
const DONE_HOLD_MS = 420
const CRT_OFF_MS = 580

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

function dialogClass(crtOff: boolean, shaking: boolean): string | undefined {
  if (crtOff) return 't-crt-off'
  if (shaking) return 't-shake'
  return undefined
}

/**
 * Motion of the auth dialog: the submit button spins while a request runs,
 * the dialog shakes on a mistake, and on success the button turns pink and
 * the dialog switches off like a CRT before the console opens.
 */
export function useAuthMotion() {
  const [spin, setSpin] = useState<SpinState>('idle')
  const [shaking, setShaking] = useState(false)
  const [crtOff, setCrtOff] = useState(false)
  const startedAt = useRef(0)
  const reduce = prefersReducedMotion()

  const begin = useCallback(() => {
    startedAt.current = performance.now()
    setCrtOff(false)
    setSpin('pending')
  }, [])

  /** Resolves once the spinner has been visible long enough to read. */
  const settle = useCallback(async () => {
    if (reduce) return
    const left = MIN_SPIN_MS - (performance.now() - startedAt.current)
    if (left > 0) await wait(left)
  }, [reduce])

  const fail = useCallback(() => {
    setSpin('idle')
    // Re-add the class on the next frame so repeated mistakes shake again.
    setShaking(false)
    requestAnimationFrame(() => setShaking(true))
    window.setTimeout(() => setShaking(false), 420)
  }, [])

  const reset = useCallback(() => setSpin('idle'), [])

  /** ✓ → CRT off → flag the console to open with CRT on. */
  const succeed = useCallback(async () => {
    setSpin('done')
    if (reduce) return
    await wait(DONE_HOLD_MS)
    setCrtOff(true)
    await wait(CRT_OFF_MS)
    markConsoleCrtOn()
  }, [reduce])

  return {
    spin,
    busy: spin !== 'idle',
    crtOff,
    begin,
    settle,
    fail,
    reset,
    succeed,
    /** Class for the dialog wrapper. */
    boxClassName: dialogClass(crtOff, shaking),
  }
}
