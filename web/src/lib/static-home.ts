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
const LANDING_PATH = '/'

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed || LANDING_PATH
}

// Captured when this module first loads. `routes/__root.tsx` imports this
// module synchronously, so the snapshot is taken before any in-app
// navigation can rewrite `window.location`.
const bootPathname =
  typeof window === 'undefined'
    ? LANDING_PATH
    : normalizePathname(window.location.pathname)

function documentEntryPathname(): string {
  if (typeof performance !== 'undefined') {
    try {
      const [entry] = performance.getEntriesByType('navigation')
      if (entry?.name) {
        return normalizePathname(new URL(entry.name).pathname)
      }
    } catch {
      // Fall back to the boot snapshot below.
    }
  }
  return bootPathname
}

/**
 * Whether this document was loaded from a path other than `/`.
 *
 * The landing page at `/` is served as a static document next to the SPA,
 * so an in-app jump to `/` has to leave the SPA with a full document load.
 * A document that itself booted at `/` (local dev, or a deployment with no
 * static landing page) must not reload: that would loop.
 */
export function shouldReloadStaticHome(): boolean {
  return documentEntryPathname() !== LANDING_PATH
}
