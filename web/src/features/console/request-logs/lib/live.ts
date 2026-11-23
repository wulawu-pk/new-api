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

/** How often the usage-log page reloads while live updates are on. */
export const LIVE_INTERVAL_MS = 10_000

const LIVE_KEY = 'peroai:logs-live'

/** Live updates are on unless the user turned them off. */
export function readLivePref(): boolean {
  try {
    return window.localStorage.getItem(LIVE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeLivePref(live: boolean): void {
  try {
    window.localStorage.setItem(LIVE_KEY, live ? 'on' : 'off')
  } catch {
    // Private mode or storage full: the choice lasts for this page only.
  }
}
