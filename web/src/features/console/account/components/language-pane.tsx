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

import { Pane } from '@/components/terminal/pane'
import { TERM_SELECT } from '@/components/terminal/styles'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useLanguagePreference } from '@/features/profile/hooks/use-language-preference'
import type { UserProfile } from '@/features/profile/types'
import { INTERFACE_LANGUAGE_OPTIONS } from '@/i18n/languages'

type LanguagePaneProps = {
  profile: UserProfile
  onUpdate: () => void
}

/** Interface language; saved to the account as soon as it changes. */
export function LanguagePane(props: LanguagePaneProps) {
  const { t } = useTranslation()
  const preference = useLanguagePreference(props.profile, props.onUpdate)

  return (
    <Pane title={<b>{t('Language')}</b>}>
      <div className='flex flex-col gap-[7px] px-5 pt-6 pb-5'>
        <Label
          htmlFor='console-language'
          className='text-t-fg2 text-[13px] font-normal'
        >
          {t('Interface Language')}
        </Label>
        <NativeSelect
          id='console-language'
          value={preference.language}
          disabled={preference.saving}
          onChange={(event) =>
            void preference.changeLanguage(event.target.value)
          }
          className={TERM_SELECT}
        >
          {INTERFACE_LANGUAGE_OPTIONS.map((language) => (
            <NativeSelectOption key={language.code} value={language.code}>
              {language.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className='text-t-dim m-0 text-[12.5px] leading-[1.6]'>
          {t(
            'Language preferences sync across your signed-in devices and affect API error messages.'
          )}
        </p>
      </div>
    </Pane>
  )
}
