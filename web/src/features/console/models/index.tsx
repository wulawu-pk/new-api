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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  ConsoleTable,
  ConsoleTableBody,
  ConsoleTableHeader,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from '@/components/terminal/console-table'
import { LoadErrorText } from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import { TERM_BUTTON_GHOST, TERM_INPUT } from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import { groupName, groupNote } from '../lib/groups'
import { ConsolePageHeader } from '../shell/console-shell'
import {
  buildPriceGroups,
  formatUSD,
  type PriceGroup,
  type PriceRow,
} from './lib/price-rows'

function headerRatio(group: PriceGroup, t: (key: string) => string): string {
  if (group.credit) {
    const credit = group.rows.find((row) => row.kind === 'credit')
    return credit && credit.kind === 'credit'
      ? `${formatUSD(credit.price)} / credit`
      : t('By credit')
  }
  if (group.rows.every((row) => row.kind === 'image' || row.kind === 'video')) {
    return t('Per image / second')
  }
  return `×${Number(group.ratio.toFixed(4))}`
}

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

/** Model plaza (window 5): every usable model and its price, by group. */
export function ConsoleModels() {
  const { t } = useTranslation()
  const pricing = usePricingData()
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState('')
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const groups = useMemo(
    () =>
      buildPriceGroups(
        pricing.models,
        pricing.usableGroup as Record<string, unknown>,
        pricing.groupRatio
      ),
    [pricing.models, pricing.usableGroup, pricing.groupRatio]
  )
  const q = query.trim().toLowerCase()
  const visible = groups
    .filter((group) => !only || group.key === only)
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row) => !q || row.model.toLowerCase().includes(q)
      ),
    }))
    .filter((group) => group.rows.length > 0)

  const copy = async (name: string) => {
    if (await copyToClipboard(name)) {
      toast.success(t('Copied {{name}}', { name }))
    } else toast.error(t('Copy failed; select and copy it manually'))
  }

  return (
    <>
      <ConsolePageHeader
        title={t('Model plaza')}
        description={t(
          'All usable models and their prices by group. Token prices are $ per 1M tokens, group ratio included.'
        )}
      />

      <div className='flex flex-wrap items-center gap-2.5'>
        <Input
          aria-label={t('Search model')}
          placeholder={t('Search model')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={cn(
            TERM_INPUT,
            'w-auto min-w-[150px] py-2 font-mono text-[13.5px] max-[480px]:flex-1'
          )}
        />
        <div
          role='group'
          aria-label={t('Filter by group')}
          className='flex flex-wrap gap-x-1.5 gap-y-1'
        >
          {[
            { key: '', label: t('All') },
            ...groups.map((g) => ({
              key: g.key,
              label: groupName(g.key, t, g.description),
            })),
          ].map((chip) => (
            <button
              key={chip.key || 'all'}
              type='button'
              aria-pressed={only === chip.key}
              onClick={() => setOnly(chip.key)}
              className={cn(
                'px-2 py-1.5 text-sm',
                only === chip.key
                  ? 'bg-t-fg text-t-bg'
                  : 'text-t-dim hover:text-t-fg'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {pricing.isLoading && (
        <Pane title={<b>{t('Models')}</b>}>
          <div className='px-[18px] py-8'>
            <span className='t-skeleton font-mono'>░░░░░░░░░░░░░░░░</span>
          </div>
        </Pane>
      )}
      {pricing.error && !pricing.isLoading && (
        <Pane title={<b>{t('Models')}</b>}>
          <LoadErrorText
            className='p-5'
            api='/api/pricing'
            reason={errorReason(pricing.error)}
            onRetry={() => void pricing.refetch()}
          />
        </Pane>
      )}
      {!pricing.isLoading && !pricing.error && visible.length === 0 && (
        <p className='text-t-dim text-sm'>
          {groups.length === 0
            ? t('No models are listed yet.')
            : t('No model with that name.')}
        </p>
      )}

      <div className='flex flex-col gap-[30px]'>
        {visible.map((group) => {
          const tokenGroup = group.rows.some((row) => row.kind === 'token')
          return (
            <Pane
              key={group.key}
              aria-label={groupName(group.key, t, group.description)}
              title={
                <>
                  <b>{groupName(group.key, t, group.description)}</b>
                  {'　'}
                  {headerRatio(group, t)}
                  {'　'}
                  {t('{{count}} models', { count: group.rows.length })}
                </>
              }
              className='pt-1.5'
            >
              <p className='text-t-dim mx-[18px] mt-3.5 mb-0 text-[13.5px] leading-[1.7]'>
                {groupNote(group.key, t, group.description)}
              </p>
              <div className='overflow-x-auto px-1 pt-2 pb-1'>
                <ConsoleTable minWidth={640}>
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
                              onClick={() => void copy(row.model)}
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
        })}
      </div>
    </>
  )
}
