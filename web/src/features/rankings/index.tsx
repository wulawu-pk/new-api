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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Skeleton } from '@/components/ui/skeleton'

import {
  MarketShareSection,
  ModelsSection,
  PulseSection,
  RankingsHero,
  TopModelsPodium,
} from './components'
import { useRankings } from './hooks/use-rankings'
import type { RankingPeriod } from './types'

const VALID_PERIODS = new Set<RankingPeriod>(['today', 'week', 'month', 'year'])

export function Rankings() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/rankings/' })
  const navigate = useNavigate()

  const period: RankingPeriod = VALID_PERIODS.has(
    search.period as RankingPeriod
  )
    ? (search.period as RankingPeriod)
    : 'week'

  const rankingsQuery = useRankings(period)
  const snapshot = rankingsQuery.data?.data

  const handlePeriodChange = (next: RankingPeriod) => {
    navigate({
      to: '/rankings',
      search: (prev) => ({ ...prev, period: next }),
    })
  }

  const renderBody = () => {
    if (rankingsQuery.isLoading) return <RankingsLoading />
    if (!snapshot) {
      return (
        <RankingsError
          message={
            rankingsQuery.error instanceof Error
              ? rankingsQuery.error.message
              : t('Unable to load rankings data')
          }
        />
      )
    }
    return (
      <>
        <TopModelsPodium
          rows={snapshot.models}
          history={snapshot.models_history}
        />
        <ModelsSection
          history={snapshot.models_history}
          rows={snapshot.models}
          period={period}
        />
        <MarketShareSection
          history={snapshot.vendor_share_history}
          rows={snapshot.vendors}
          period={period}
        />
        <PulseSection
          movers={snapshot.top_movers}
          droppers={snapshot.top_droppers}
        />
      </>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <section className='relative px-4 pt-28 pb-20 sm:px-6 lg:pt-32'>
        <div
          aria-hidden
          className='ascii-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] opacity-40'
        />
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-6'>
          <RankingsHero
            period={period}
            onPeriodChange={handlePeriodChange}
            snapshot={snapshot}
          />
          {renderBody()}
        </div>
      </section>
      <Footer />
    </PublicLayout>
  )
}

function RankingsLoading() {
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className='h-72 rounded-3xl' />
        ))}
      </div>
      <Skeleton className='h-[480px] w-full rounded-3xl' />
      <Skeleton className='h-[360px] w-full rounded-3xl' />
    </div>
  )
}

function RankingsError(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className='border-border rounded-3xl border border-dashed px-6 py-14 text-center'>
      <p className='font-ascii text-muted-foreground/70 mb-2 text-xs'>
        $ rankings --period
      </p>
      <h2 className='text-base font-semibold'>
        {t('Unable to load rankings')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
        {props.message}
      </p>
    </div>
  )
}
