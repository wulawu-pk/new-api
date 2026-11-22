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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConsoleShell } from '../console-shell'

vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: null }) }))
vi.mock('@/hooks/use-admin', () => ({ useIsAdmin: () => false }))
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
  const pages = ['/dashboard', '/keys', '/user-agreement'].map((p) =>
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

function topBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>('header > div > div')
  if (!bar) throw new Error('top bar not rendered')
  return bar
}

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  fireEvent.scroll(window)
}

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

describe('console top bar', () => {
  it('lists the docs after the six windows as entry 07 linking to the static docs', async () => {
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    const nav = screen.getByRole('navigation', { name: 'Console pages' })
    const links = within(nav).getAllByRole('link')

    expect(links).toHaveLength(7)
    expect(links[6]).toHaveAttribute('href', '/docs/')
    expect(links[6]).toHaveTextContent('07Docs')
    expect(links[0]).toHaveTextContent('01Overview')
  })

  it('folds into the floating pill once the page scrolls and unfolds back at the top', async () => {
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')
    expect(topBar()).not.toHaveAttribute('data-condensed')

    act(() => scrollTo(200))
    await waitFor(() =>
      expect(topBar()).toHaveAttribute('data-condensed', 'true')
    )

    act(() => scrollTo(0))
    await waitFor(() => expect(topBar()).not.toHaveAttribute('data-condensed'))
  })

  it('opens the narrow-screen menu with the pages and legal links, and closes it on Escape', async () => {
    renderShell('/keys')
    await screen.findByText('/keys page')
    const toggle = screen.getByRole('button', {
      name: 'Toggle navigation menu',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    const menu = screen.getByRole('navigation', { name: 'Console menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu).getAllByRole('link')).toHaveLength(7)
    expect(
      within(menu).getByRole('link', { current: 'page' })
    ).toHaveTextContent('Keys')
    expect(
      screen.getAllByRole('link', { name: 'Privacy Policy' }).length
    ).toBeGreaterThan(0)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Console menu' })
      ).not.toBeInTheDocument()
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when one of its pages is opened', async () => {
    renderShell('/keys')
    await screen.findByText('/keys page')
    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle navigation menu' })
    )
    const menu = screen.getByRole('navigation', { name: 'Console menu' })

    fireEvent.click(within(menu).getByRole('link', { name: /Overview/ }))
    await screen.findByText('/dashboard page')
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Console menu' })
      ).not.toBeInTheDocument()
    )
  })

  it('draws the plain grid instead of the sonar canvas when a page asks for the grid backdrop', async () => {
    const root = createRootRoute({
      component: () => (
        <ConsoleShell backdrop='grid'>
          <div>reading page</div>
        </ConsoleShell>
      ),
    })
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('reading page')

    expect(document.querySelector('[data-backdrop="grid"]')).not.toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('keeps the sonar canvas behind ordinary console pages', async () => {
    renderShell('/dashboard')
    await screen.findByText('/dashboard page')

    expect(document.querySelector('canvas')).not.toBeNull()
    expect(document.querySelector('[data-backdrop="grid"]')).toBeNull()
  })

  it('marks the open legal document in the status bar', async () => {
    renderShell('/user-agreement')
    await screen.findByText('/user-agreement page')
    const footer = screen.getByRole('contentinfo')

    expect(
      within(footer).getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(footer).getByRole('link', { name: 'Privacy Policy' })
    ).not.toHaveAttribute('aria-current')
  })
})
