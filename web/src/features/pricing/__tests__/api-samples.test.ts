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

import { buildSample } from '../lib/code-samples'

const GEMINI = {
  baseUrl: 'https://api.peroai.cc',
  apiKeyEnv: 'NEW_API_KEY',
  modelName: 'gemini-3.8-flash',
  endpointType: 'gemini',
  endpointPath: '/v1beta/models/gemini-3.8-flash:generateContent',
}

describe('Gemini code samples', () => {
  it('calls the REST path on this gateway with the API key header', () => {
    const curl = buildSample('curl', 'gemini', GEMINI)
    expect(curl).toContain(
      'https://api.peroai.cc/v1beta/models/gemini-3.8-flash:generateContent'
    )
    expect(curl).toContain('x-goog-api-key: $NEW_API_KEY')
    expect(curl).not.toContain('?key=')
  })

  it('points both SDKs at this gateway so they append /v1beta themselves', () => {
    const python = buildSample('python', 'gemini', GEMINI)
    expect(python).toContain('from google import genai')
    expect(python).toContain(
      'http_options=types.HttpOptions(base_url="https://api.peroai.cc")'
    )

    const typescript = buildSample('typescript', 'gemini', GEMINI)
    expect(typescript).toContain("from '@google/genai'")
    expect(typescript).toContain(
      "httpOptions: { baseUrl: 'https://api.peroai.cc' }"
    )
  })
})
