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
import { describe, expect, test } from 'vitest'

import { resolveLegacyRoute } from './legacy-route'

describe('legacy frontend route migration', () => {
  test('maps former public and console routes to their current destinations', () => {
    const routes = {
      '/login': '/sign-in',
      '/forbidden': '/403',
      '/console': '/dashboard',
      '/console/models': '/models',
      '/console/deployment': '/models/deployments',
      '/console/subscription': '/subscriptions',
      '/console/channel': '/channels',
      '/console/token': '/keys',
      '/console/playground': '/playground',
      '/console/redemption': '/redemption-codes',
      '/console/user': '/users',
      '/console/personal': '/profile',
      '/console/log': '/usage-logs',
      '/console/midjourney': '/usage-logs/drawing',
      '/console/task': '/usage-logs/task',
      '/console/chat/42': '/chat/42',
    }

    for (const [source, target] of Object.entries(routes)) {
      expect(resolveLegacyRoute(source)).toBe(target)
    }
  })

  test('preserves search and hash while applying route-specific behavior', () => {
    expect(resolveLegacyRoute('/login?redirect=%2Fkeys#continue')).toBe(
      '/sign-in?redirect=%2Fkeys#continue'
    )
    expect(resolveLegacyRoute('/console/topup?source=email#orders')).toBe(
      '/wallet?source=email#orders'
    )
  })

  test('maps legacy settings tabs and retains unrelated parameters', () => {
    const settingsTabs = {
      operation: '/system-settings/operations/behavior',
      dashboard: '/system-settings/content/dashboard',
      chats: '/system-settings/content/chat',
      drawing: '/system-settings/content/drawing',
      payment: '/system-settings/billing/payment',
      ratio: '/system-settings/billing/model-pricing',
      ratelimit: '/system-settings/security/rate-limit',
      models: '/system-settings/models/global',
      'model-deployment': '/system-settings/models/model-deployment',
      performance: '/system-settings/operations/performance',
      system: '/system-settings/site/system-info',
      other: '/system-settings/site/system-info',
    }

    for (const [tab, target] of Object.entries(settingsTabs)) {
      expect(
        resolveLegacyRoute(`/console/setting?tab=${tab}&from=bookmark#form`)
      ).toBe(`${target}?tab=${tab}&from=bookmark#form`)
    }
    expect(resolveLegacyRoute('/console/setting?tab=unknown')).toBe(
      '/system-settings?tab=unknown'
    )
  })

  test('sends retired public pages to the new site', () => {
    expect(resolveLegacyRoute('/rankings?period=month')).toBe('/')
    expect(resolveLegacyRoute('/about')).toBe('/')
    expect(resolveLegacyRoute('/pricing/claude-opus-5-5')).toBe('/pricing')
    expect(resolveLegacyRoute('/pricing/gpt-6.2-sol/?group=gpt-pro#api')).toBe(
      '/pricing?group=gpt-pro#api'
    )
    expect(resolveLegacyRoute('/pricing')).toBe(null)
    expect(resolveLegacyRoute('/pricing?group=gpt-pro')).toBe(null)
  })

  test('safely redirects unknown console locations without touching new routes', () => {
    expect(resolveLegacyRoute('/console/removed?page=2#old')).toBe(
      '/dashboard?page=2#old'
    )
    expect(resolveLegacyRoute('/dashboard')).toBe(null)
    expect(resolveLegacyRoute('/api/status')).toBe(null)
  })

  test('matches legacy paths regardless of case and trailing slashes', () => {
    expect(resolveLegacyRoute('/About')).toBe('/')
    expect(resolveLegacyRoute('/ABOUT')).toBe('/')
    expect(resolveLegacyRoute('/About/')).toBe('/')
    expect(resolveLegacyRoute('/about///')).toBe('/')
    expect(resolveLegacyRoute('/Rankings?period=month')).toBe('/')
    expect(resolveLegacyRoute('/RANKINGS/')).toBe('/')
    expect(resolveLegacyRoute('/Pricing/gpt-6.2-sol')).toBe('/pricing')
    expect(resolveLegacyRoute('/PRICING/xxx/?group=gpt-pro#api')).toBe(
      '/pricing?group=gpt-pro#api'
    )
    expect(resolveLegacyRoute('/pricing')).toBe(null)
    expect(resolveLegacyRoute('/PRICING')).toBe(null)
    expect(resolveLegacyRoute('/PRICING/')).toBe(null)
    expect(resolveLegacyRoute('/Login?redirect=%2Fkeys#continue')).toBe(
      '/sign-in?redirect=%2Fkeys#continue'
    )
    expect(resolveLegacyRoute('/CONSOLE/TOKEN')).toBe('/keys')
    expect(resolveLegacyRoute('/CONSOLE/SETTING?tab=RATIO')).toBe(
      '/system-settings/billing/model-pricing?tab=RATIO'
    )
    expect(resolveLegacyRoute('/CONSOLE/SETTING?tab=Constructor')).toBe(
      '/system-settings?tab=Constructor'
    )
    expect(resolveLegacyRoute('/CONSOLE/CHAT/AbC')).toBe('/chat/AbC')
  })
})
