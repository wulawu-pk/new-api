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
import { afterAll, describe, expect, test } from 'vitest'

import i18n from '../config'

// `<html lang>` selects the regional CJK font and line-breaking rules in
// styles/index.css, so it must be a valid BCP 47 tag, never `zhCN` / `zhTW`.
describe('html lang follows the interface language', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  test.each([
    ['zhCN', 'zh-CN'],
    ['zhTW', 'zh-TW'],
    ['en', 'en'],
    ['fr', 'fr'],
    ['ru', 'ru'],
    ['ja', 'ja'],
    ['vi', 'vi'],
  ])('switching to %s sets lang=%s', async (language, expected) => {
    await i18n.changeLanguage(language)

    expect(document.documentElement.lang).toBe(expected)
  })

  test('an invalid language tag falls back to lang=en', async () => {
    await i18n.changeLanguage('zh')
    await i18n.changeLanguage('not a tag!')

    expect(document.documentElement.lang).toBe('en')
  })
})
