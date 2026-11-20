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
 * Sign-up asks only for an email (sign-in accepts email or username), but
 * new-api requires a unique username of at most 20 characters. Derive one
 * from the email's local part plus a random suffix; a collision is retried
 * by the caller with a new suffix.
 */
export function deriveUsername(
  email: string,
  random: () => number = Math.random
): string {
  const local = email.split('@')[0] ?? ''
  const base =
    local
      .toLowerCase()
      .replaceAll(/[^a-z0-9_]/g, '')
      .slice(0, 12) || 'user'
  const suffix = Math.floor(random() * 0x10000)
    .toString(16)
    .padStart(4, '0')
  return `${base}_${suffix}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}
