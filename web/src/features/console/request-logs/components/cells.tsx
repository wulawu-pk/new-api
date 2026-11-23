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

import { AsciiBar } from '@/components/terminal/ascii-bar'
import { formatCacheHitRate } from '@/features/usage-logs/lib/cache-hit-rate'
import { formatCredits } from '@/features/usage-logs/lib/credit-billing'

import { compactTokens, type ConsoleLogRow } from '../lib/log-row'

/** Cache hit as a 10-cell bar plus the percentage; a dash when not reported. */
export function CacheHitCell(props: { rate: number | null }) {
  if (props.rate == null) return <span className='text-t-dim'>—</span>
  const text = formatCacheHitRate(props.rate)
  return (
    <span className='inline-flex items-center gap-2 whitespace-nowrap'>
      <AsciiBar value={props.rate * 100} label={text} />
      <span className='text-t-dim font-mono text-xs'>{text}</span>
    </span>
  )
}

/** Whether the response was streamed; non-streamed is dimmed. */
export function StreamCell(props: { streamed: boolean }) {
  const { t } = useTranslation()
  if (props.streamed) {
    return (
      <span className='text-[12.5px] whitespace-nowrap'>{t('Streamed')}</span>
    )
  }
  return (
    <span className='text-t-dim text-[12.5px] whitespace-nowrap'>
      {t('Not streamed')}
    </span>
  )
}

/** Usage: `in → out` tokens, or the credits a kiro request consumed. */
export function UsageText(props: { row: ConsoleLogRow }) {
  const credits = props.row.credit?.credits
  if (credits != null) return <>{formatCredits(credits)} credit</>
  return (
    <>
      {compactTokens(props.row.input)} → {compactTokens(props.row.output)}
    </>
  )
}
