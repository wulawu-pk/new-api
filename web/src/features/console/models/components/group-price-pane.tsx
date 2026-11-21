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

import {
  ConsoleTable,
  ConsoleTableBody,
  ConsoleTableHeader,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from '@/components/terminal/console-table'
import { Pane } from '@/components/terminal/pane'
import { TERM_BUTTON_GHOST } from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'

import { groupName, groupNote } from '../../lib/groups'
import {
  formatUSD,
  groupRatioLabel,
  type PriceGroup,
  type PriceRow,
} from '../lib/price-rows'

function PriceCells(props: { row: PriceRow }) {
  const { t } = useTranslation()
  const row = props.row
  if (row.kind === 'credit') {
    return (
      <ConsoleTd kind='num' colSpan={3}>
        {formatUSD(row.price)} / credit
      </ConsoleTd>
    )
  }
  if (row.kind === 'video') {
    const unit = row.unit === 'second' ? t('second') : t('clip')
    return (
      <ConsoleTd kind='num' colSpan={3}>
        {formatUSD(row.price)} / {unit}
      </ConsoleTd>
    )
  }
  if (row.kind === 'image') {
    return (
      <ConsoleTd kind='num' colSpan={3}>
        {row.tiers
          .map((tier) =>
            tier.label
              ? `${tier.label} ${formatUSD(tier.price)}`
              : formatUSD(tier.price)
          )
          .join(' · ')}{' '}
        / {t('image')}
      </ConsoleTd>
    )
  }
  return (
    <>
      <ConsoleTd kind='num'>{formatUSD(row.input)}</ConsoleTd>
      <ConsoleTd kind='num'>{formatUSD(row.output)}</ConsoleTd>
      <ConsoleTd kind='num'>{formatUSD(row.cacheRead)}</ConsoleTd>
    </>
  )
}

/** One group's price table: header with ratio and count, a note, rows. */
export function GroupPricePane(props: {
  group: PriceGroup
  onCopy: (model: string) => void
}) {
  const { t } = useTranslation()
  const group = props.group
  const name = groupName(group.key, t, group.description)
  const tokenGroup = group.rows.some((row) => row.kind === 'token')

  return (
    <Pane
      hero
      aria-label={name}
      title={
        <>
          <b>{name}</b>
          {'　'}
          {groupRatioLabel(group, t)}
          {'　'}
          {t('{{count}} models', { count: group.rows.length })}
        </>
      }
      className='pt-1.5'
    >
      <p className='text-t-dim mx-[18px] mt-3.5 mb-0 text-[13.5px] leading-[1.7]'>
        {groupNote(group.key, t, group.description)}
      </p>
      <div className='overflow-x-auto px-1 pt-1 pb-1'>
        {/* Compact rows: a group is read as one screen, not scrolled. */}
        <ConsoleTable minWidth={600} className='[&_td]:py-2'>
          <ConsoleTableHeader>
            <ConsoleTableRow className='hover:bg-transparent'>
              <ConsoleTh>{t('Model')}</ConsoleTh>
              {tokenGroup ? (
                <>
                  <ConsoleTh kind='num'>{t('Input')}</ConsoleTh>
                  <ConsoleTh kind='num'>{t('Output')}</ConsoleTh>
                  <ConsoleTh kind='num'>{t('Cache read')}</ConsoleTh>
                </>
              ) : (
                <ConsoleTh kind='num' colSpan={3}>
                  {t('Price')}
                </ConsoleTh>
              )}
              <ConsoleTh>{t('API')}</ConsoleTh>
              <ConsoleTh kind='num'>
                <span className='sr-only'>{t('Actions')}</span>
              </ConsoleTh>
            </ConsoleTableRow>
          </ConsoleTableHeader>
          <ConsoleTableBody>
            {group.rows.map((row) => (
              <ConsoleTableRow key={row.model}>
                <ConsoleTd kind='mono'>
                  {row.model}
                  {row.kind === 'token' && row.peak && (
                    <span className='text-t-warn ml-2 font-sans text-xs'>
                      {t('peak ×2')}
                    </span>
                  )}
                </ConsoleTd>
                <PriceCells row={row} />
                <ConsoleTd kind='mono' className='text-t-dim'>
                  {row.api.join(' · ') || '—'}
                </ConsoleTd>
                <ConsoleTd>
                  <div className='flex justify-end'>
                    <Button
                      size='sm'
                      variant='ghost'
                      className={TERM_BUTTON_GHOST}
                      onClick={() => props.onCopy(row.model)}
                    >
                      {t('Copy model name')}
                    </Button>
                  </div>
                </ConsoleTd>
              </ConsoleTableRow>
            ))}
          </ConsoleTableBody>
        </ConsoleTable>
      </div>
    </Pane>
  )
}
