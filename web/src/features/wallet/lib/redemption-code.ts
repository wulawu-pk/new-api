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

// peroai: redemption codes are 32 hex characters (a UUID without dashes,
// common.GetUUID). Shops deliver them with surrounding text, a trailing
// space or a full activation link, so pull the code out of whatever the
// buyer pasted instead of sending the raw text and failing the redeem.
const CODE_PATTERN = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/i

export function extractRedemptionCode(input: string): string {
  const text = input.trim()
  const match = CODE_PATTERN.exec(text)
  if (match) return match[0].toLowerCase()
  return text
}
