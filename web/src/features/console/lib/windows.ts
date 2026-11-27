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
/**
 * Console windows (the tmux-style window bar). Number keys 1–6 switch to
 * the window with that index. Paths are the routes that render inside the
 * new console shell; everything else keeps the old admin layout.
 */
export type ConsoleWindow = {
  key: string
  /** i18n key of the short window name. */
  labelKey: string
  path: string
  /** Other paths that count as this window. */
  match?: (pathname: string) => boolean
}

export const CONSOLE_WINDOWS: readonly ConsoleWindow[] = [
  { key: 'dash', labelKey: 'Overview', path: '/dashboard' },
  { key: 'keys', labelKey: 'Keys', path: '/keys' },
  { key: 'logs', labelKey: 'Logs', path: '/usage-logs' },
  { key: 'wallet', labelKey: 'Wallet', path: '/wallet' },
  {
    key: 'models',
    labelKey: 'Models',
    path: '/pricing',
    match: (pathname) => pathname === '/pricing' || pathname === '/pricing/',
  },
  { key: 'status', labelKey: 'Status', path: '/status' },
]

/**
 * Usage docs: a static site served next to the console (`/docs/` on the
 * same host, so beta opens the beta docs). It is the last entry of the
 * window bar and number key 7, but a full page load, not an SPA route.
 */
export const CONSOLE_DOCS_HREF = '/docs/'

/** Legal documents, linked from the status bar and the mobile menu. */
export const LEGAL_PAGES = [
  { key: 'terms', labelKey: 'User Agreement', path: '/user-agreement' },
  { key: 'privacy', labelKey: 'Privacy Policy', path: '/privacy-policy' },
] as const

export type LegalPageKey = (typeof LEGAL_PAGES)[number]['key']

function normalize(pathname: string): string {
  // Route matching ignores case and trailing slashes; window detection must
  // agree or a `/Dashboard` visit would be treated as a non-console page.
  const trimmed = pathname.replace(/\/+$/, '')
  return (trimmed || '/').toLowerCase()
}

/** The window a path belongs to, or undefined for non-console pages. */
export function findConsoleWindow(pathname: string): ConsoleWindow | undefined {
  const path = normalize(pathname)
  return CONSOLE_WINDOWS.find((win) =>
    win.match ? win.match(path) : path === win.path
  )
}

/**
 * Account pages: rendered in the console shell but not numbered windows;
 * reached from 「账户」 in the status bar.
 */
export const ACCOUNT_PATHS: readonly string[] = ['/profile', '/security']

/** Whether a path is one of the account pages. */
export function isAccountPath(pathname: string): boolean {
  return ACCOUNT_PATHS.includes(normalize(pathname))
}

/** Whether a route under `_authenticated` renders in the console shell. */
export function isConsolePath(pathname: string): boolean {
  return findConsoleWindow(pathname) !== undefined || isAccountPath(pathname)
}

/**
 * Where a signed-in customer lands when they open a page outside the console
 * shell (the upstream dashboard, log sections, playground, chat, error
 * routes). Those pages keep the old admin layout, which only administrators
 * should see. Returns null when the path is fine as it is.
 */
export function customerConsoleRedirect(
  pathname: string,
  isAdmin: boolean
): string | null {
  if (isAdmin || isConsolePath(pathname)) return null
  const path = normalize(pathname)
  if (path.startsWith('/usage-logs')) return '/usage-logs'
  return '/dashboard'
}

/** Keys typed into text fields or while a dialog is open are not shortcuts. */
export function isShortcutTarget(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false
  const target = event.target as HTMLElement | null
  const tag = target?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false
  if (target?.isContentEditable) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
    return false
  }
  return true
}
