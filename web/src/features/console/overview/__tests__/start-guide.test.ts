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

import { apiBase, firstRequestCurl, sampleModel } from '../lib/start-guide'

describe('start guide sample request', () => {
  it('builds a chat completions curl on the API base with the given key and model', () => {
    const curl = firstRequestCurl({
      base: 'https://api.peroai.cc',
      key: 'sk-abc',
      model: 'gpt-6.2-astra',
    })

    expect(curl.split('\n')).toEqual([
      'curl https://api.peroai.cc/v1/chat/completions \\',
      '  -H "Authorization: Bearer sk-abc" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"model":"gpt-6.2-astra","messages":[{"role":"user","content":"hi"}]}\'',
    ])
  })

  it('uses the last model called, else the default of the key family', () => {
    expect(sampleModel('deepseek-v4', 'gpt-pro')).toBe('deepseek-v4')
    expect(sampleModel(undefined, 'claude-kiro')).toBe('claude-sonnet-5-5')
    expect(sampleModel(undefined, 'gpt-pro')).toBe('gpt-6.2-astra')
    expect(sampleModel(undefined, undefined)).toBe('gpt-6.2-astra')
  })

  it('takes the configured server address without a trailing slash and falls back to this origin', () => {
    expect(apiBase('https://api.peroai.cc/')).toBe('https://api.peroai.cc')
    expect(apiBase('')).toBe(window.location.origin)
    expect(apiBase(undefined)).toBe(window.location.origin)
  })
})
