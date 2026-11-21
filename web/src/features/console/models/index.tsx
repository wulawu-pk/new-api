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

import { LoadErrorText } from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import { TERM_INPUT } from '@/components/terminal/styles'
import { Input } from '@/components/ui/input'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import { ConsolePageHeader } from '../shell/console-shell'
import { GroupList } from './components/group-list'
import { GroupPricePane } from './components/group-price-pane'
import { buildPriceGroups } from './lib/price-rows'

type ConsoleModelsProps = {
  /** Group to open first (`?group=` on /pricing). */
  group?: string
  /** Called when the user picks another group, to keep it in the URL. */
  onGroupChange?: (key: string) => void
}

/**
 * Model plaza (window 5). Groups are listed on the left and one group's
 * prices are shown on the right, so a group reads as one screen instead of
 * ten tables stacked down the page. A search looks through every group and
 * shows each group that has a match, which also compares one model's price
 * across groups.
 */
export function ConsoleModels(props: ConsoleModelsProps) {
  const { t } = useTranslation()
  const pricing = usePricingData()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(props.group ?? '')
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
  const current = groups.find((g) => g.key === picked) ?? groups[0]

  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const matched = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => row.model.toLowerCase().includes(q)),
    }))
    .filter((group) => group.rows.length > 0)
  let shown = current ? [current] : []
  if (searching) shown = matched

  const select = (key: string) => {
    setQuery('')
    setPicked(key)
    props.onGroupChange?.(key)
  }

  const copy = async (name: string) => {
    if (await copyToClipboard(name)) {
      toast.success(t('Copied {{name}}', { name }))
    } else toast.error(t('Copy failed; select and copy it manually'))
  }

  const loaded = !pricing.isLoading && !pricing.error

  return (
    <>
      <ConsolePageHeader
        title={t('Model plaza')}
        description={t(
          'All usable models and their prices by group. Token prices are $ per 1M tokens, group ratio included.'
        )}
      />

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
      {loaded && groups.length === 0 && (
        <p className='text-t-dim text-sm'>{t('No models are listed yet.')}</p>
      )}

      {loaded && groups.length > 0 && (
        <div className='grid grid-cols-[232px_minmax(0,1fr)] items-start gap-5 max-md:grid-cols-1'>
          <div className='flex flex-col gap-3 md:sticky md:top-[78px]'>
            <Input
              type='search'
              aria-label={t('Search model')}
              placeholder={t('Search all groups')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={cn(TERM_INPUT, 'py-2 font-mono text-[13.5px]')}
            />
            <GroupList
              groups={groups}
              selected={searching ? undefined : current?.key}
              matches={
                searching
                  ? Object.fromEntries(
                      matched.map((g) => [g.key, g.rows.length])
                    )
                  : undefined
              }
              onSelect={select}
            />
          </div>

          <div className='flex min-w-0 flex-col gap-5'>
            {searching && (
              <p className='text-t-dim m-0 text-sm' aria-live='polite'>
                {shown.length === 0
                  ? t('No model with that name.')
                  : t('“{{query}}” in {{count}} groups', {
                      query: query.trim(),
                      count: shown.length,
                    })}
              </p>
            )}
            {shown.map((group) => (
              <GroupPricePane
                key={group.key}
                group={group}
                onCopy={(model) => void copy(model)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
