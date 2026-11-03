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
import type { LogOtherData, ResponseModelObservation } from '../types'

export type { ResponseModelObservation }

/**
 * Read the response-model observation from a parsed `other` object.
 *
 * The backend records it under admin_info, which model.formatUserLogs strips
 * for everyone but administrators, so ordinary users never receive the three
 * names at all. The same object used to sit at the top level of `other`, where
 * every viewer could read it; that placement is deliberately ignored so rows
 * written before the move cannot surface the diagnostic to a consumer either.
 */
export function getResponseModelObservation(
  other: LogOtherData | null | undefined
): ResponseModelObservation | undefined {
  if (!other) return undefined
  return other.admin_info?.response_model
}

/** Separators providers are inconsistent about; folding them makes
 * "claude-sonnet-5-5" and "claude-sonnet-5.5" the same model. Slashes are left
 * alone: they carry the provider namespace. */
const SEPARATOR_PATTERN = /[-._\s]+/g

function normalizeModelName(name: string): string {
  return name.toLowerCase().replace(SEPARATOR_PATTERN, '')
}

/**
 * Whether two model names denote the same model once case and separators are
 * folded. Used to decide whether a row has anything to show at all, so a
 * provider that spells "claude-sonnet-5-5" where the request said
 * "claude-sonnet-5.5" does not turn the cell into a details trigger.
 */
export function isSameModelName(a?: string, b?: string): boolean {
  const left = normalizeModelName(a ?? '')
  const right = normalizeModelName(b ?? '')
  return left !== '' && left === right
}

/**
 * Decide whether an upstream response model deserves a mismatch warning.
 *
 * Mirrors relay/common/response_model.go: after folding case and separators
 * ("-", ".", "_", spaces), the returned name is compatible when it starts with
 * the requested or upstream model (dated versions, variants) or ends with it
 * (provider paths such as "deepseek/deepseek-v4.1-flash"). Nothing is stored;
 * every row is judged with the current rule.
 */
export function isResponseModelMismatch(
  observation: ResponseModelObservation | undefined
): boolean {
  if (!observation) return false
  if ((observation.returned_model ?? '').trim() === '') return false
  const returned = normalizeModelName(observation.returned_model ?? '')
  for (const candidate of [
    observation.requested_model,
    observation.upstream_model,
  ]) {
    const expected = normalizeModelName(candidate ?? '')
    if (expected === '') continue
    if (returned.startsWith(expected) || returned.endsWith(expected)) {
      return false
    }
  }
  return true
}
