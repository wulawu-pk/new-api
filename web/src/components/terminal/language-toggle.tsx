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
import { useTranslation } from 'react-i18next'

import { useChangeLanguage } from '@/hooks/use-change-language'

import { TermSegmented } from './term-segmented'

const ITEMS = [
  { value: 'zh', label: <span lang='zh-CN'>中</span> },
  { value: 'en', label: <span lang='en'>EN</span> },
] as const

/**
 * 中 | EN switch in the top bar. Any Chinese interface language shows 中 as
 * chosen; 中 switches to Simplified Chinese (`zhCN`), EN to English, the two
 * values the beta landing page and docs also write. The account's language
 * page still offers every interface language.
 */
export function LanguageToggle(props: { className?: string }) {
  const { t, i18n } = useTranslation()
  const changeLanguage = useChangeLanguage()
  const current = (i18n.resolvedLanguage || i18n.language || '').toLowerCase()
  const value = current.startsWith('zh') ? 'zh' : 'en'

  return (
    <TermSegmented
      size='sm'
      label={t('Language')}
      value={value}
      items={ITEMS}
      onValueChange={(next) => {
        if (next !== value) void changeLanguage(next === 'zh' ? 'zhCN' : 'en')
      }}
      className={props.className}
    />
  )
}
