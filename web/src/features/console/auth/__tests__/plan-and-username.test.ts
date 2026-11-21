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
import { afterEach, describe, expect, it } from 'vitest'

import {
  consumePendingPlan,
  planFromSearch,
  readPendingPlan,
  savePendingPlan,
} from '../lib/pending-plan'
import { deriveUsername, isEmail } from '../lib/username'

afterEach(() => sessionStorage.clear())

describe('pending plan', () => {
  it('reads group, model and client from the landing-page link', () => {
    expect(
      planFromSearch({
        plan: 'gpt-pro',
        model: 'gpt-6-astra',
        client: 'Claude Code',
      })
    ).toEqual({
      group: 'gpt-pro',
      model: 'gpt-6-astra',
      client: 'Claude Code',
    })
  })

  it('drops values that are not short plain identifiers', () => {
    expect(planFromSearch({ plan: '<script>' })).toBeNull()
    expect(planFromSearch({ plan: 'gpt-pro', model: 'a"b' })).toEqual({
      group: 'gpt-pro',
      model: undefined,
      client: undefined,
    })
  })

  it('is consumed once so the key is created a single time', () => {
    savePendingPlan({ group: 'deepseek' })

    expect(consumePendingPlan()?.group).toBe('deepseek')
    expect(consumePendingPlan()).toBeNull()
  })

  it('ignores the same landing-page link once its key was created (browser back)', () => {
    const link = { plan: 'gpt-pro', model: 'gpt-6.2-astra', client: 'Codex' }
    savePendingPlan({
      group: 'gpt-pro',
      model: 'gpt-6.2-astra',
      client: 'Codex',
    })
    consumePendingPlan()

    expect(planFromSearch(link)).toBeNull()
  })

  it('still takes a different configuration after a key was created', () => {
    savePendingPlan({
      group: 'gpt-pro',
      model: 'gpt-6.2-astra',
      client: 'Codex',
    })
    consumePendingPlan()

    expect(
      planFromSearch({
        plan: 'claude-kiro',
        model: 'claude-opus-5-5',
        client: 'Claude Code',
      })
    ).toEqual({
      group: 'claude-kiro',
      model: 'claude-opus-5-5',
      client: 'Claude Code',
    })
  })

  it('takes the same link again 30 minutes after its key was created', () => {
    const link = { plan: 'gpt-pro', model: 'gpt-6.2-astra', client: 'Codex' }
    savePendingPlan({
      group: 'gpt-pro',
      model: 'gpt-6.2-astra',
      client: 'Codex',
    })
    consumePendingPlan()

    expect(planFromSearch(link, Date.now() + 31 * 60 * 1000)?.group).toBe(
      'gpt-pro'
    )
  })

  it('expires after 30 minutes', () => {
    savePendingPlan({ group: 'deepseek' })

    expect(readPendingPlan(Date.now() + 31 * 60 * 1000)).toBeNull()
  })
})

describe('derived username', () => {
  it('keeps the safe part of the email and adds a 4-hex suffix within 20 characters', () => {
    const name = deriveUsername('Alice.Smith+cc@example.com', () => 0.5)

    expect(name).toBe('alicesmithcc_8000')
    expect(name.length).toBeLessThanOrEqual(20)
  })

  it('falls back to "user" when nothing usable is left', () => {
    expect(deriveUsername('...@example.com', () => 0)).toBe('user_0000')
  })

  it('accepts only plausible email addresses', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('ab.co')).toBe(false)
  })
})
