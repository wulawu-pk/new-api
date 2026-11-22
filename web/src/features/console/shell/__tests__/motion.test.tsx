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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsoleShell } from '../console-shell'

/** What the shell's notice bell reads; tests change the unread count. */
const notificationsMock = {
  popoverOpen: false,
  setPopoverOpen: () => undefined,
  unreadCount: 0,
  activeTab: 'notice' as const,
  setActiveTab: () => undefined,
  notice: '',
  announcements: [],
  loading: false,
}

vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: null }) }))
vi.mock('@/hooks/use-admin', () => ({ useIsAdmin: () => false }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => notificationsMock,
}))
vi.mock('../../hooks/use-self-user', () => ({
  useSelfUser: () => ({ data: undefined }),
}))
vi.mock('../use-plan-key', () => ({ usePlanKey: () => undefined }))
vi.mock('@/components/terminal/use-scramble', () => ({
  useScrambleText: () => undefined,
}))

function renderShell(path: string) {
  const root = createRootRoute({
    component: () => (
      <ConsoleShell>
        <Outlet />
      </ConsoleShell>
    ),
  })
  const pages = ['/dashboard', '/keys', '/profile'].map((p) =>
    createRoute({
      getParentRoute: () => root,
      path: p,
      component: () => <div>{p} page</div>,
    })
  )
  const router = createRouter({
    routeTree: root.addChildren(pages),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

function tabMark(): HTMLElement {
  const mark = document.querySelector<HTMLElement>('.t-tab-mark')
  if (!mark) throw new Error('tab mark not rendered')
  return mark
}

function windowTab(label: string): HTMLElement {
  const nav = screen.getByRole('navigation', { name: 'Console pages' })
  return within(nav).getByRole('link', { name: new RegExp(label) })
}

/** Keyframe transforms of the last slide played on the tab block. */
function lastSlide(): string[] | undefined {
  const index = animate.mock.contexts.lastIndexOf(tabMark())
  if (index < 0) return undefined
  const frames = animate.mock.calls[index][0] as Keyframe[]
  return frames.map((frame) => String(frame.transform))
}

function pageFades(): number {
  const main = document.querySelector('#content')
  return animate.mock.contexts.filter((el) => el === main).length
}

const originalMatchMedia = window.matchMedia
function setMatchMedia(value: typeof window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value })
}
function allowMotion() {
  setMatchMedia(
    (query: string) =>
      ({ ...originalMatchMedia(query), matches: false }) as MediaQueryList
  )
}
const animate = vi.fn()
/** jsdom lays nothing out; tests decide whether elements are on screen. */
let drawn = true

// Browser layout boundaries jsdom lacks: element animation, whether an
// element is drawn, and tab geometry (window tabs are 64px apart).
const geometry = {
  animate: { configurable: true, value: animate },
  getClientRects: {
    configurable: true,
    value: () => ({ length: drawn ? 1 : 0 }),
  },
  offsetLeft: {
    configurable: true,
    get(this: HTMLElement) {
      const nav = this.closest('nav')
      if (!nav || this.tagName !== 'A') return 0
      return [...nav.querySelectorAll('a')].indexOf(this as never) * 64
    },
  },
  offsetWidth: {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'A' ? 62 : 0
    },
  },
} satisfies PropertyDescriptorMap
const nativeGeometry = Object.getOwnPropertyDescriptors(HTMLElement.prototype)

beforeEach(() => {
  drawn = true
  Object.defineProperties(HTMLElement.prototype, geometry)
})

afterEach(() => {
  cleanup()
  animate.mockReset()
  setMatchMedia(originalMatchMedia)
  for (const key of Object.keys(geometry)) {
    const native = nativeGeometry[key]
    if (native) Object.defineProperty(HTMLElement.prototype, key, native)
    else Reflect.deleteProperty(HTMLElement.prototype, key)
  }
})

describe('console shell motion', () => {
  it('shows the selected-tab block on a window page and hides it on an account page', async () => {
    const router = renderShell('/keys')
    await screen.findByText('/keys page')
    expect(tabMark().style.opacity).toBe('1')

    await act(() => router.navigate({ to: '/profile' }))
    await screen.findByText('/profile page')
    expect(tabMark().style.opacity).toBe('0')
  })

  it('fades the new page in when switching windows with motion allowed', async () => {
    allowMotion()
    const router = renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    animate.mockClear()

    await act(() => router.navigate({ to: '/keys' }))
    await screen.findByText('/keys page')
    expect(pageFades()).toBe(1)
  })

  it('fades the page in when a fresh shell mounts on a different page, as /pricing and /status do', async () => {
    allowMotion()
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    cleanup()
    animate.mockClear()

    renderShell('/keys')
    await screen.findByText('/keys page')
    expect(pageFades()).toBe(1)
  })

  it('holds the page fade until the new page is on screen', async () => {
    allowMotion()
    const router = renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    animate.mockClear()
    drawn = false

    await act(() => router.navigate({ to: '/keys' }))
    await screen.findByText('/keys page')
    expect(pageFades()).toBe(0)

    drawn = true
    await waitFor(() => expect(pageFades()).toBe(1))
  })

  it('slides the block from the old tab to a clicked tab at the moment of the click', async () => {
    allowMotion()
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    animate.mockClear()

    fireEvent.click(windowTab('Keys'))
    expect(lastSlide()).toEqual(['translateX(0px)', 'translateX(64px)'])
  })

  it('slides the block from the previous tab when a fresh shell mounts, as /pricing and /status do', async () => {
    allowMotion()
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    cleanup()
    animate.mockClear()

    renderShell('/keys')
    await screen.findByText('/keys page')
    expect(lastSlide()).toEqual(['translateX(0px)', 'translateX(64px)'])
  })

  it('switches windows without animating when reduced motion is preferred', async () => {
    const router = renderShell('/dashboard')
    await screen.findByText('/dashboard page')

    fireEvent.click(windowTab('Keys'))
    await act(() => router.navigate({ to: '/keys' }))
    await screen.findByText('/keys page')
    expect(animate).not.toHaveBeenCalled()
    expect(tabMark().style.transform).toBe('translateX(64px)')
  })
})
