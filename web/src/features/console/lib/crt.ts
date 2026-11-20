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
/**
 * Sign-in plays a CRT "switch off" on the dialog, then the console opens
 * from a bright line. The flag crosses the route change in sessionStorage
 * and is consumed once by the console shell.
 */
const CRT_FLAG = 'peroai:crt-on'

export function markConsoleCrtOn(): void {
  try {
    sessionStorage.setItem(CRT_FLAG, '1')
  } catch {
    /* storage unavailable: skip the effect */
  }
}

export function consumeConsoleCrtOn(): boolean {
  try {
    const on = sessionStorage.getItem(CRT_FLAG) === '1'
    if (on) sessionStorage.removeItem(CRT_FLAG)
    return on
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
