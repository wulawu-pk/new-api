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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { TERM_BUTTON } from '@/components/terminal/styles'

/** Small outline button used for the actions at the end of a row. */
export const ROW_BUTTON = `${TERM_BUTTON} py-1.5 text-[13px]`

/** Same, for actions that remove or turn something off. */
export const ROW_BUTTON_DANGER = `${ROW_BUTTON} hover:border-t-bad hover:text-t-bad`

/**
 * One line of a settings list inside a pane: label, value (with an optional
 * note under it) and actions on the right. Rows sit in a `<dl>` and are
 * separated by a hairline. On phones the label moves above the value.
 */
export function AccountRow(props: {
  label: ReactNode
  children: ReactNode
  note?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className='border-t-line grid grid-cols-[7em_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto] [&+&]:border-t'>
      <dt className='text-t-dim text-[13px] max-sm:col-span-2'>
        {props.label}
      </dt>
      <dd className='m-0 min-w-0 break-words'>
        {props.children}
        {props.note != null && (
          <div className='text-t-dim mt-0.5 text-[12.5px] leading-[1.6]'>
            {props.note}
          </div>
        )}
      </dd>
      {props.actions != null && (
        <div className='flex flex-wrap justify-end gap-2'>{props.actions}</div>
      )}
    </div>
  )
}

/** `● On` / `○ Off` status text. */
export function OnOffText(props: { on: boolean }) {
  const { t } = useTranslation()
  if (props.on) {
    return (
      <span>
        <span className='text-t-ok' aria-hidden='true'>
          ●
        </span>{' '}
        {t('Enabled')}
      </span>
    )
  }
  return (
    <span className='text-t-fg2'>
      <span className='text-t-dim' aria-hidden='true'>
        ○
      </span>{' '}
      {t('Not enabled')}
    </span>
  )
}
