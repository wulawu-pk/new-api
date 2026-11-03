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

import {
  isResponseModelMismatch,
  type ResponseModelObservation,
} from '../response-model'

function observation(
  returned: string,
  overrides: Partial<ResponseModelObservation> = {}
): ResponseModelObservation {
  return {
    requested_model: 'requested',
    upstream_model: 'mapped',
    returned_model: returned,
    ...overrides,
  }
}

describe('isResponseModelMismatch', () => {
  test.each([
    ['requested', 'exact requested model'],
    ['mapped', 'exact upstream model'],
    ['Requested', 'case-only difference'],
    ['requested-2026-09-01', 'dated variant of the requested model'],
    ['mapped-2026-09-01', 'dated variant of the upstream model'],
    ['deepseek/requested', 'provider path in front of the requested model'],
    ['vendor/MAPPED', 'provider path with a case-only difference'],
    ['accounts/vendor/models/requested', 'nested provider path'],
    ['reques.ted', 'dot instead of a hyphen in the requested model'],
    ['re_quest_ed', 'underscores inside the requested model'],
    ['request ed', 'spaces instead of hyphens'],
    ['re--qu..est__ed', 'a run of mixed separators'],
    ['map-ped', 'hyphen instead of the upstream dot'],
  ])('treats %s as compatible (%s)', (returned) => {
    expect(isResponseModelMismatch(observation(returned))).toBe(false)
  })

  test.each([
    ['other', 'different model'],
    ['request', 'shorter name that the expected model extends'],
    ['vendor/other', 'different model behind a provider path'],
    ['vendor/request', 'provider path with a shorter name'],
    ['vendor/', 'provider path with no model segment'],
    ['vendor', 'provider segment alone'],
    ['o-ther', 'separator folding does not rescue a different model'],
  ])('flags %s as a mismatch (%s)', (returned) => {
    expect(isResponseModelMismatch(observation(returned))).toBe(true)
  })

  test('separator folding does not equate another version', () => {
    expect(
      isResponseModelMismatch(
        observation('claude-sonnet-5.6', {
          requested_model: 'claude-sonnet-5-5',
          upstream_model: '',
        })
      )
    ).toBe(true)
  })

  test.each([
    [
      'claude-sonnet-5-5',
      'claude-sonnet-5.5',
      'hyphen requested, dotted returned',
    ],
    [
      'claude-sonnet-5.5',
      'claude-sonnet-5-5',
      'dotted requested, hyphen returned',
    ],
    ['claude_sonnet_5_5', 'CLAUDE-SONNET-5.5', 'underscores, hyphens and case'],
    [
      'claude-sonnet-5-5',
      'claude sonnet 5.5',
      'spaces inserted by the provider',
    ],
    [
      'claude-sonnet-5.5',
      'claude-sonnet-5-5-2026-09-01',
      'separator difference plus a dated suffix',
    ],
    [
      'anthropic/claude-sonnet-5-5',
      'anthropic/claude-sonnet-5.5',
      'separator difference behind a provider path',
    ],
  ])('treats %s and %s as the same model (%s)', (requested, returned) => {
    expect(
      isResponseModelMismatch(
        observation(returned, {
          requested_model: requested,
          upstream_model: '',
        })
      )
    ).toBe(false)
  })

  test('compares separator-only differences on the upstream model too', () => {
    expect(
      isResponseModelMismatch(
        observation('claude-sonnet-5.5', {
          requested_model: 'claude-sonnet-4-5',
          upstream_model: 'claude-sonnet-5-5',
        })
      )
    ).toBe(false)
  })

  test('separator folding still flags a different model', () => {
    expect(
      isResponseModelMismatch(
        observation('claude-sonnet-5.6', {
          requested_model: 'claude-sonnet-5-5',
          upstream_model: '',
        })
      )
    ).toBe(true)
    expect(
      isResponseModelMismatch(
        observation('other', { requested_model: 'requested' })
      )
    ).toBe(true)
  })

  test('compares against provider-qualified requested and upstream names as written', () => {
    expect(
      isResponseModelMismatch(
        observation('vendor/requested-2026-09-01', {
          requested_model: 'vendor/requested',
        })
      )
    ).toBe(false)
    expect(
      isResponseModelMismatch(
        observation('vendor/other', { requested_model: 'vendor/requested' })
      )
    ).toBe(true)
  })

  test('empty expected names never match', () => {
    expect(
      isResponseModelMismatch(
        observation('other', { requested_model: '', upstream_model: '' })
      )
    ).toBe(true)
  })

  test('returns false without an observation or a returned model', () => {
    expect(isResponseModelMismatch(undefined)).toBe(false)
    expect(isResponseModelMismatch(observation(''))).toBe(false)
  })
})
