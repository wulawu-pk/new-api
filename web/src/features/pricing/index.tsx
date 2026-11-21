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
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingSidebar,
  PricingToolbar,
  ModelDetailsDrawer,
  PricingGroupSectionView,
} from './components'
import type { ModelPerfBadgeData } from './components/model-perf-badge'
import { VendorFacets } from './components/vendor-facets'
import { EXCLUDED_GROUPS, FILTER_ALL, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import { buildGroupSections, collectModelNames } from './lib/group-sections'

/** Cap on models per perf request; the backend rejects larger batches. */
const MAX_PERF_MODELS = 50

export function Pricing() {
  const { t } = useTranslation()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const sections = useMemo(
    () =>
      buildGroupSections(
        filteredModels,
        usableGroup || {},
        groupRatio || {},
        undefined,
        groupFilter === FILTER_ALL ? undefined : groupFilter
      ),
    [filteredModels, usableGroup, groupRatio, groupFilter]
  )

  // One perf request covers every model currently on screen.
  const perfModelNames = useMemo(
    () => collectModelNames(filteredModels).slice(0, MAX_PERF_MODELS),
    [filteredModels]
  )
  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24, perfModelNames],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetricsSummary(24, perfModelNames)),
    enabled: perfModelNames.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  })
  const perfMap = useMemo(() => {
    const map = new Map<string, ModelPerfBadgeData>()
    const payload = perfQuery.data?.data
    for (const model of payload?.models ?? []) {
      map.set(model.model_name, {
        ...model,
        window_start: payload?.window_start,
        window_end: payload?.window_end,
      })
    }
    for (const [name, series] of Object.entries(
      payload?.recent_success_series ?? {}
    )) {
      map.set(name, {
        avg_latency_ms: Number.NaN,
        avg_tps: Number.NaN,
        success_rate: Number.NaN,
        ...map.get(name),
        recent_success_series: series,
      })
    }
    return map
  }, [perfQuery.data])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    return (
      <div className='flex flex-col gap-8'>
        {sections.map((section) => (
          <PricingGroupSectionView
            key={section.key}
            section={section}
            perf={perfMap}
            priceRate={priceRate}
            usdExchangeRate={usdExchangeRate}
            tokenUnit={tokenUnit}
            showRechargePrice={showRechargePrice}
            viewMode={viewMode === VIEW_MODES.TABLE ? 'table' : 'card'}
            onModelClick={handleModelClick}
          />
        ))}
      </div>
    )
  }

  const endpointTypeCount = useMemo(
    () =>
      new Set(
        (models || []).flatMap((model) => model.supported_endpoint_types ?? [])
      ).size,
    [models]
  )
  const vendorCount = useMemo(
    () =>
      new Set((models || []).map((model) => model.vendor_name).filter(Boolean))
        .size,
    [models]
  )

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1600px] px-4 pt-28 pb-10 sm:px-6'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  const metrics = [
    { label: t('Models'), value: models?.length || 0 },
    { label: t('Vendors'), value: vendorCount },
    { label: t('Groups'), value: availableGroups.length },
    { label: t('Endpoint Type'), value: endpointTypeCount },
  ]

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative px-4 pt-28 pb-20 sm:px-6 lg:pt-32'>
        <div
          aria-hidden
          className='ascii-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] opacity-40'
        />
        <div className='mx-auto w-full max-w-[1600px]'>
          <header className='mx-auto flex max-w-4xl flex-col items-center text-center'>
            <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
              [ {t('Model Square')} ]
            </p>
            <h1 className='mt-5 text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance'>
              {t('This site currently has {{count}} models enabled', {
                count: models?.length || 0,
              })}
            </h1>
            <p className='text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg'>
              {t(
                'Discover curated AI models, compare pricing and capabilities, and choose the right model for every scenario.'
              )}
            </p>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onClear={clearSearch}
              placeholder={t(
                'Search model name, provider, endpoint, or tag...'
              )}
              className='mt-9 w-full max-w-2xl'
            />
          </header>

          <dl className='border-border lg:divide-border mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-y-8 border-y py-8 lg:grid-cols-4 lg:divide-x'>
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className='flex flex-col items-center gap-2 px-4'
              >
                <dt className='text-muted-foreground order-2 text-xs tracking-[0.12em] uppercase'>
                  {metric.label}
                </dt>
                <dd className='font-ascii order-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
                  {formatNumber(metric.value)}
                </dd>
              </div>
            ))}
          </dl>

          <div className='mt-14'>
            <VendorFacets
              vendors={vendors || []}
              models={models || []}
              value={vendorFilter}
              onChange={setVendorFilter}
            />
          </div>

          <div className='mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]'>
            <PricingSidebar
              quotaTypeFilter={quotaTypeFilter}
              endpointTypeFilter={endpointTypeFilter}
              vendorFilter={vendorFilter}
              groupFilter={groupFilter}
              tagFilter={tagFilter}
              onQuotaTypeChange={setQuotaTypeFilter}
              onEndpointTypeChange={setEndpointTypeFilter}
              onVendorChange={setVendorFilter}
              onGroupChange={setGroupFilter}
              onTagChange={setTagFilter}
              vendors={vendors || []}
              groups={availableGroups}
              groupRatios={groupRatio}
              tags={availableTags}
              models={models || []}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              className='hover-scrollbar sticky top-24 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto xl:block'
            />

            <main className='min-w-0 space-y-6'>
              <PricingToolbar
                filteredCount={filteredModels.length}
                totalCount={models?.length}
                sortBy={sortBy}
                onSortChange={setSortBy}
                tokenUnit={tokenUnit}
                onTokenUnitChange={setTokenUnit}
                showRechargePrice={showRechargePrice}
                onRechargePriceChange={setShowRechargePrice}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                quotaTypeFilter={quotaTypeFilter}
                endpointTypeFilter={endpointTypeFilter}
                vendorFilter={vendorFilter}
                groupFilter={groupFilter}
                tagFilter={tagFilter}
                onQuotaTypeChange={setQuotaTypeFilter}
                onEndpointTypeChange={setEndpointTypeFilter}
                onVendorChange={setVendorFilter}
                onGroupChange={setGroupFilter}
                onTagChange={setTagFilter}
                vendors={vendors || []}
                groups={availableGroups}
                groupRatios={groupRatio}
                tags={availableTags}
                models={models || []}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />

              {renderPricingContent()}
            </main>
          </div>

          {selectedModel && (
            <ModelDetailsDrawer
              open={Boolean(selectedModel)}
              onOpenChange={(open) => {
                if (!open) setSelectedModelName(null)
              }}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
            />
          )}
        </div>
      </div>
      <Footer />
    </PublicLayout>
  )
}
