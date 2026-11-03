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
import { describe, expect, it } from 'vitest'

import {
  buildGroupSections,
  collectModelNames,
  PREFERRED_GROUP_ORDER,
} from '../group-sections'
import type { PricingModel } from '../../types'

function model(
  name: string,
  groups: string[],
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: name.length,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: groups,
    group_ratio: { 'gpt-pro': 0.5, 'claude-kiro': 1, 'image-all': 1.2 },
    ...overrides,
  }
}

describe('buildGroupSections', () => {
  it('orders groups by the shipped reading order, not by model order', () => {
    const sections = buildGroupSections(
      [
        model('image-model', ['image-all']),
        model('claude-model', ['claude-kiro']),
        model('gpt-model', ['gpt-pro']),
      ],
      {},
      {}
    )
    expect(sections.map((section) => section.key)).toEqual([
      'gpt-pro',
      'claude-kiro',
      'image-all',
    ])
    expect(PREFERRED_GROUP_ORDER.slice(0, 3)).toEqual([
      'gpt-pro',
      'gpt-promax',
      'gpt-test',
    ])
  })

  it('lists a model under every group it is enabled in, with that group ratio', () => {
    const sections = buildGroupSections(
      [model('shared', ['gpt-pro', 'claude-kiro'])],
      {},
      { 'gpt-pro': 0.5, 'claude-kiro': 1 }
    )
    expect(sections.map((section) => section.key)).toEqual([
      'gpt-pro',
      'claude-kiro',
    ])
    expect(sections[0].ratio).toBe(0.5)
    expect(sections[1].ratio).toBe(1)
    expect(sections[0].models).toHaveLength(1)
    expect(sections[1].models).toHaveLength(1)
  })

  it('drops the default alias when the model has a real group', () => {
    const sections = buildGroupSections(
      [model('gpt-model', ['gpt-pro', 'default'])],
      {},
      {}
    )
    expect(sections.map((section) => section.key)).toEqual(['gpt-pro'])
  })

  it('keeps a model that only belongs to default and to routing pseudo-groups', () => {
    const defaultOnly = buildGroupSections(
      [model('only-default', ['default'])],
      {},
      {}
    )
    expect(defaultOnly.map((section) => section.key)).toEqual(['default'])

    const autoOnly = buildGroupSections([model('auto-only', ['auto'])], {}, {})
    expect(autoOnly.map((section) => section.key)).toEqual(['default'])
    expect(autoOnly[0].models.map((item) => item.model_name)).toEqual([
      'auto-only',
    ])
  })

  it('uses the administrator description and falls back to the slug', () => {
    const sections = buildGroupSections(
      [model('a', ['gpt-pro']), model('b', ['claude-kiro'])],
      {
        'gpt-pro': { desc: 'ChatGPT-Pro【企业】· GPT 主力' },
        'claude-kiro': {},
      },
      {}
    )
    expect(sections[0].description).toBe('ChatGPT-Pro【企业】· GPT 主力')
    expect(sections[1].description).toBe('claude-kiro')
  })

  it('places an unknown group after the known ones and keeps it visible', () => {
    const sections = buildGroupSections(
      [model('new-model', ['brand-new-group']), model('gpt', ['gpt-pro'])],
      {},
      {}
    )
    expect(sections.map((section) => section.key)).toEqual([
      'gpt-pro',
      'brand-new-group',
    ])
  })

  it('returns no sections for an empty catalog', () => {
    expect(buildGroupSections([], {}, {})).toEqual([])
  })
})

describe('collectModelNames', () => {
  it('deduplicates and keeps first-seen order', () => {
    expect(
      collectModelNames([
        model('b', ['gpt-pro']),
        model('a', ['gpt-pro']),
        model('b', ['claude-kiro']),
      ])
    ).toEqual(['b', 'a'])
  })

  it('skips empty names', () => {
    expect(
      collectModelNames([model('', ['gpt-pro']), model('a', ['gpt-pro'])])
    ).toEqual(['a'])
  })
})
