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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** Paths the console pages link to; rendered as stubs. */
const STUB_PATHS = [
  '/',
  '/status',
  '/keys',
  '/wallet',
  '/pricing',
  '/dashboard',
  '/usage-logs',
  '/usage-logs/$section',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/channels',
  '/profile',
  '/user-agreement',
  '/privacy-policy',
]

/**
 * Renders a console page inside a memory router (so `Link` works) and a
 * fresh QueryClient without retries, at `path`.
 */
export function renderConsole(ui: ReactNode, path = '/page') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path,
    component: () => ui,
  })
  const stubs = STUB_PATHS.filter((p) => p !== path).map((p) =>
    createRoute({
      getParentRoute: () => root,
      path: p,
      component: () => <div>{p} page</div>,
    })
  )
  const router = createRouter({
    routeTree: root.addChildren([page, ...stubs]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { ...view, router, queryClient }
}
