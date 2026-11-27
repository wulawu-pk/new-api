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
const legacyOrigin = 'https://legacy-route.invalid'

const legacyConsoleRoutes: Record<string, string> = {
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
}

const legacySettingsTabs: Record<string, string> = {
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

function normalizeLegacyPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed || '/'
}

function buildTargetHref(targetPath: string, source: URL): string {
  const target = new URL(targetPath, legacyOrigin)
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value)
  })
  target.hash = source.hash
  return `${target.pathname}${target.search}${target.hash}`
}

export function resolveLegacyRoute(rawHref: string): string | null {
  let source: URL
  try {
    source = new URL(rawHref, legacyOrigin)
  } catch {
    return null
  }

  const pathname = normalizeLegacyPath(source.pathname)
  // Route matching is case-insensitive, so the legacy checks must be too.
  // Dynamic segments are still read from `pathname` to keep their casing.
  const lowerPath = pathname.toLowerCase()
  // peroai: upstream public pages that the new site does not offer. The
  // rankings page published site-wide usage and the about page is empty;
  // single-model pages are replaced by the model square.
  if (lowerPath === '/rankings' || lowerPath === '/about') {
    return '/'
  }
  if (lowerPath.startsWith('/pricing/')) {
    return buildTargetHref('/pricing', source)
  }
  if (lowerPath === '/login') {
    return buildTargetHref('/sign-in', source)
  }
  if (lowerPath === '/forbidden') {
    return buildTargetHref('/403', source)
  }
  if (lowerPath === '/console/topup') {
    return buildTargetHref('/wallet', source)
  }
  if (lowerPath === '/console/setting') {
    const tab = (source.searchParams.get('tab') ?? '').toLowerCase()
    const target = legacySettingsTabs[tab] ?? '/system-settings'
    return buildTargetHref(target, source)
  }
  if (lowerPath === '/console/chat') {
    return buildTargetHref('/dashboard', source)
  }
  if (lowerPath.startsWith('/console/chat/')) {
    const chatID = pathname.slice('/console/chat/'.length)
    return buildTargetHref(chatID ? `/chat/${chatID}` : '/dashboard', source)
  }

  const target = legacyConsoleRoutes[lowerPath]
  if (target) return buildTargetHref(target, source)
  if (lowerPath.startsWith('/console/')) {
    return buildTargetHref('/dashboard', source)
  }

  return null
}
