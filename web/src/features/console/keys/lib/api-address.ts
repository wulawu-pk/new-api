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
 * The API base URL customers configure: the site's `ServerAddress`
 * (https://api.peroai.cc on peroai) without a trailing slash, or this
 * page's origin when it is not set or not a URL.
 */
export function apiBaseUrl(serverAddress: unknown): string {
  if (typeof serverAddress === 'string' && serverAddress.trim()) {
    try {
      const url = new URL(serverAddress.trim())
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
      }
    } catch {
      /* fall through */
    }
  }
  return typeof window === 'undefined' ? '' : window.location.origin
}
