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
export type BotProtectionFormValues = {
  TurnstileCheckEnabled: boolean
  TurnstileSiteKey?: string
  TurnstileSecretKey?: string
}

/** Shown when Turnstile is switched on without both keys. */
export const TURNSTILE_KEYS_REQUIRED =
  'Enter the Turnstile site key and secret key before turning Turnstile on.'

/**
 * Whether turning Turnstile on in this save has both keys: typed now, or
 * already stored (the stored site key is public in /api/status).
 */
export function turnstileKeysReady(
  data: BotProtectionFormValues,
  stored: { siteKey?: string; secretKeyConfigured?: boolean }
): boolean {
  const siteKey = data.TurnstileSiteKey?.trim() || stored.siteKey?.trim()
  const secretKey =
    data.TurnstileSecretKey?.trim() || stored.secretKeyConfigured === true
  return Boolean(siteKey && secretKey)
}
