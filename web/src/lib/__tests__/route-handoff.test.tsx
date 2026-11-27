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
import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The first case imports the whole route tree, which can take tens of
// seconds when the full suite runs in parallel.
vi.setConfig({ testTimeout: 60_000 })

const replace = vi.fn()
const reload = vi.fn()
const realWindow = window

vi.mock('@/features/setup/api', () => ({
  getSetupStatus: vi.fn(async () => ({
    success: true,
    data: { status: true },
  })),
}))

vi.mock('@/lib/auth-session', () => ({
  bootstrapAuthentication: vi.fn(async () => undefined),
  resolveAuthentication: vi.fn(async () => 'anonymous'),
  clearAuthenticatedClientState: vi.fn(),
  clearAuthentication: vi.fn(),
}))

vi.mock('@/lib/nav-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nav-modules')>()
  return {
    ...actual,
    getModuleAccessForGuard: vi.fn(async () => ({
      enabled: true,
      requireAuth: false,
    })),
  }
})

function stubWindowWithLocationReplace() {
  const location = {
    get pathname() {
      return realWindow.location.pathname
    },
    get href() {
      return realWindow.location.href
    },
    get search() {
      return realWindow.location.search
    },
    get hash() {
      return realWindow.location.hash
    },
    get origin() {
      return realWindow.location.origin
    },
    replace,
    reload,
    assign: vi.fn(),
  }
  vi.stubGlobal(
    'window',
    new Proxy(realWindow, {
      get(target, property) {
        if (property === 'location') return location
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  )
}

async function loadRouteAt(entry: string, signedIn = false) {
  realWindow.history.replaceState({}, '', entry)
  vi.resetModules()

  if (signedIn) {
    const { useAuthStore } = await import('@/stores/auth-store')
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 1, username: 'test-user', role: 1 },
      },
    }))
  }

  const { createMemoryHistory, createRouter, isRedirect } =
    await import('@tanstack/react-router')
  const { routeTree } = await import('@/routeTree.gen')

  const router = createRouter({
    routeTree,
    context: {
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
    history: createMemoryHistory({ initialEntries: [entry] }),
  })

  try {
    await router.load()
  } catch (error) {
    // A redirect is navigation, not a failed load; anything else must fail.
    if (!isRedirect(error)) throw error
  }
  return router
}

beforeEach(() => {
  replace.mockClear()
  reload.mockClear()
  stubWindowWithLocationReplace()
})

afterEach(() => {
  replace.mockClear()
  reload.mockClear()
  vi.unstubAllGlobals()
  realWindow.history.replaceState({}, '', '/')
})

describe('retired public routes', () => {
  it.each(['/About', '/ABOUT', '/About/', '/about///'])(
    'sends %s to the landing page with a full document load',
    async (entry) => {
      await loadRouteAt(entry)

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    }
  )

  it.each(['/Rankings', '/RANKINGS/', '/rankings?period=month'])(
    'sends %s to the landing page with a full document load',
    async (entry) => {
      await loadRouteAt(entry)

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    }
  )

  it.each([
    '/Pricing/gpt-6.2-sol',
    '/PRICING/xxx/',
    '/PRICING/xxx/?group=gpt-pro#api',
  ])('sends %s to the model square without a document load', async (entry) => {
    const router = await loadRouteAt(entry)

    expect(replace).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/pricing')
    if (entry.includes('group=')) {
      expect(router.state.location.searchStr).toBe('?group=gpt-pro')
      expect(router.state.location.hash).toBe('api')
    }
  })

  it('leaves the model square itself alone', async () => {
    const router = await loadRouteAt('/PRICING/')

    expect(replace).not.toHaveBeenCalled()
    // No redirect runs, so the router keeps the user's casing and slash.
    expect(
      router.state.location.pathname.toLowerCase().replace(/\/+$/, '')
    ).toBe('/pricing')
  })
})

describe('landing page handoff', () => {
  it('hands an installed setup wizard back to the static landing page', async () => {
    await loadRouteAt('/setup')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('hands a signed-in redirect back to the static landing page', async () => {
    await loadRouteAt('/sign-in?redirect=/', true)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('keeps search and hash when an in-app jump targets the landing page', async () => {
    const router = await loadRouteAt('/status')

    await router.navigate({ to: '/', search: { aff: 'demo' }, hash: 'top' })

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/?aff=demo#top'))
  })

  it('reloads the document when the address bar already holds the hash target', async () => {
    const router = await loadRouteAt('/status')
    // Browsers commit the router's target (search and hash included) before
    // the hook runs; replacing that same URL would only move the fragment.
    realWindow.history.replaceState({}, '', '/?aff=demo#top')

    void router.navigate({ to: '/', search: { aff: 'demo' }, hash: 'top' })

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(replace).not.toHaveBeenCalled()
  })

  it('renders the fallback page when the document booted at the landing page', async () => {
    const router = await loadRouteAt('/')

    expect(replace).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/')
    expect(
      router.state.matches.find((match) => match.routeId === '/')?.status
    ).toBe('success')
  })

  it('does not leave the page on hover preload', async () => {
    const router = await loadRouteAt('/status')

    await router.preloadRoute({ to: '/' })

    expect(replace).not.toHaveBeenCalled()
  })
})
