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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { Home } from '@/features/home'
import { shouldReloadStaticHome } from '@/lib/static-home'

export const Route = createFileRoute('/')({
  beforeLoad: ({ location, preload }) => {
    // Hovering a `<Link to='/'>` only preloads; it must not take the user away.
    if (preload) return
    if (!shouldReloadStaticHome()) return
    // `/` is the static landing page next to the SPA. Leaving through a full
    // document load is the only way to reach it; keep any search and hash.
    // `location.href` carries the encoded query and fragment, unlike the
    // decoded `location.hash`.
    const target = new URL(location.href, 'https://static-landing.invalid')
    target.pathname = '/'
    const targetHref = `${target.pathname}${target.search}${target.hash}`
    // The router commits the target to the address bar before this hook runs.
    // A same-URL `location.replace` only moves the fragment in Chrome and
    // never requests the static document, so align the fragment and reload
    // the current document instead.
    if (
      window.location.pathname === target.pathname &&
      window.location.search === target.search
    ) {
      if (window.location.hash !== target.hash) {
        window.history.replaceState(window.history.state, '', targetHref)
      }
      window.location.reload()
      // Stay pending until the browser unloads this document.
      return new Promise<void>(() => undefined)
    }
    throw redirect({
      href: targetHref,
      replace: true,
      reloadDocument: true,
    })
  },
  component: Home,
})
