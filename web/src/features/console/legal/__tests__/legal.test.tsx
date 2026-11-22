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
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ConsoleLegal } from '..'
import { renderConsole } from '../../__tests__/render-console'

type Doc = { success: boolean; message?: string; data?: string }

const AGREEMENT = [
  '**更新日期：2026-11-15**',
  '',
  '欢迎使用 peroai。另见《[隐私政策](/privacy-policy)》，或联系 [support@peroai.cc](mailto:support@peroai.cc)、[上游](https://example.com/terms)。',
  '',
  '## 一、服务范围',
  '',
  '1. 本站提供模型接入。',
  '',
  '## 二、账户与 API 密钥',
  '',
  '请妥善保管密钥。',
].join('\n')

let responses: Record<string, Doc | Error>

beforeEach(() => {
  responses = {
    '/api/user-agreement': { success: true, data: AGREEMENT },
    '/api/privacy-policy': { success: true, data: '' },
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const response = responses[url]
    if (response instanceof Error) throw response
    if (!response) throw new Error(`unexpected request ${url}`)
    return { data: response }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('console legal pages', () => {
  it('renders the agreement with an outline of its sections', async () => {
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')

    const heading = await screen.findByRole('heading', { name: '一、服务范围' })
    expect(
      screen.getByRole('region', { name: 'User Agreement' })
    ).toContainElement(heading)
    const outline = screen.getByRole('navigation', { name: 'On this page' })
    const entries = within(outline).getAllByRole('button')
    expect(entries.map((entry) => entry.textContent)).toEqual([
      '一、服务范围',
      '二、账户与 API 密钥',
    ])
    expect(entries[0]).toHaveAttribute('aria-current', 'location')
  })

  it('scrolls to a section and marks it when its outline entry is clicked', async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')
    const outline = await screen.findByRole('navigation', {
      name: 'On this page',
    })

    const second = within(outline).getByRole('button', {
      name: '二、账户与 API 密钥',
    })
    fireEvent.click(second)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toHaveTextContent(
      '二、账户与 API 密钥'
    )
    expect(second).toHaveAttribute('aria-current', 'location')
  })

  it('opens the other legal document in the same window when its link in the text is clicked', async () => {
    const { router } = renderConsole(
      <ConsoleLegal doc='terms' />,
      '/user-agreement'
    )
    const link = await screen.findByRole('link', { name: '隐私政策' })

    const followed = fireEvent.click(link)

    expect(followed).toBe(false)
    expect(await screen.findByText('/privacy-policy page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/privacy-policy')
  })

  it('leaves links to other sites and mail links to the browser', async () => {
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')
    const external = await screen.findByRole('link', { name: '上游' })
    const mail = screen.getByRole('link', { name: 'support@peroai.cc' })

    expect(fireEvent.click(external)).toBe(true)
    expect(fireEvent.click(mail)).toBe(true)
    expect(external).toHaveAttribute('target', '_blank')
  })

  it('switches between the two documents and marks the one shown', async () => {
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')
    const group = await screen.findByRole('group', { name: 'Legal documents' })

    expect(
      within(group).getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(group).getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy')
  })

  it('says the policy is not configured when the server returns no text', async () => {
    renderConsole(<ConsoleLegal doc='privacy' />, '/privacy-policy')

    expect(
      await screen.findByText(
        'The administrator has not configured a privacy policy yet.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'On this page' })
    ).not.toBeInTheDocument()
  })

  it('names the failed endpoint and retries it when loading fails', async () => {
    responses['/api/user-agreement'] = new Error('Network Error')
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')

    expect(await screen.findByText('/api/user-agreement')).toBeInTheDocument()
    responses['/api/user-agreement'] = { success: true, data: AGREEMENT }
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: '一、服务范围' })
    ).toBeInTheDocument()
  })

  it('offers the external link when the document is a URL', async () => {
    responses['/api/user-agreement'] = {
      success: true,
      data: 'https://example.com/terms',
    }
    renderConsole(<ConsoleLegal doc='terms' />, '/user-agreement')

    expect(
      await screen.findByRole('button', { name: 'View document' })
    ).toHaveAttribute('href', 'https://example.com/terms')
  })
})
