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
import { ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { GroupBadge } from '@/components/group-badge'
import { Button } from '@/components/ui/button'
import { getLobeIcon } from '@/lib/lobe-icon'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import type { PricingGroupSection } from '../lib/group-sections'
import type { PricingModel, TokenUnit } from '../types'
import { ModelCard } from './model-card'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'
import { ModelPriceCell } from './model-price-cell'

export type PricingGroupSectionProps = {
  section: PricingGroupSection
  perf: Map<string, ModelPerfBadgeData>
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  /** 'card' renders model cards, 'table' a compact price table. */
  viewMode: 'card' | 'table'
  onModelClick: (modelName: string) => void
}

const SectionModelRow = memo(function SectionModelRow(props: {
  model: PricingModel
  perf?: ModelPerfBadgeData
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  onModelClick: (modelName: string) => void
}) {
  const { t } = useTranslation()
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 16) : null
  const endpoints = props.model.supported_endpoint_types ?? []
  const description = (props.model.description || '').trim()

  return (
    <tr className='border-border/60 hover:bg-muted/30 border-t transition-colors'>
      <td className='min-w-0 px-3 py-3 align-top sm:px-4'>
        <div className='flex min-w-0 items-center gap-2'>
          {modelIcon}
          <span className='truncate font-mono text-sm font-medium'>
            {props.model.model_name}
          </span>
          <CopyButton
            value={props.model.model_name}
            tooltip={t('Copy model name')}
            className='size-6 shrink-0'
            iconClassName='size-3'
          />
        </div>
        {description && (
          <p className='text-muted-foreground mt-1 line-clamp-2 max-w-md text-xs leading-5'>
            {description}
          </p>
        )}
        {endpoints.length > 0 && (
          <p className='text-muted-foreground/70 mt-1 font-mono text-[11px]'>
            {endpoints.join(' · ')}
          </p>
        )}
      </td>
      <td className='min-w-0 px-3 py-3 align-top sm:px-4'>
        <ModelPriceCell
          model={props.model}
          options={{
            tokenUnit: props.tokenUnit,
            priceRate: props.priceRate,
            usdExchangeRate: props.usdExchangeRate,
            showRechargePrice: props.showRechargePrice,
          }}
        />
      </td>
      <td className='w-64 px-3 py-3 align-top sm:px-4'>
        <div className='flex flex-col items-start gap-1'>
          <ModelPerfBadge perf={props.perf} />
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 h-7 gap-1 px-2 text-xs'
            onClick={() => props.onModelClick(props.model.model_name || '')}
          >
            {t('Details')}
            <ChevronRight aria-hidden className='size-3' />
          </Button>
        </div>
      </td>
    </tr>
  )
})

/**
 * One group of the model square: the administrator's description, the group
 * multiplier, then that group's models and prices.
 *
 * Prices come from the same cells the rest of the console uses, so every billing
 * shape (token tiers, credits, per-image sizes, task usage) stays correct.
 */
export function PricingGroupSectionView(props: PricingGroupSectionProps) {
  const { t } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const sectionKey = props.section.key

  return (
    <section
      id={`group-${sectionKey}`}
      aria-labelledby={`group-${sectionKey}-title`}
      className='flex flex-col gap-3'
    >
      <header className='flex flex-wrap items-start justify-between gap-x-4 gap-y-2'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <GroupBadge group={sectionKey} />
            <h2
              id={`group-${sectionKey}-title`}
              className='text-foreground min-w-0 text-base font-semibold break-words'
            >
              {props.section.description}
            </h2>
            {props.section.ratio != null && props.section.ratio !== 1 && (
              <span className='bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums'>
                ×{props.section.ratio}
              </span>
            )}
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('{{count}} models', { count: props.section.models.length })}
          </p>
        </div>
      </header>

      {props.viewMode === 'card' ? (
        <div className='grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {props.section.models.map((model) => (
            <ModelCard
              key={`${sectionKey}:${model.model_name}`}
              model={model}
              tokenUnit={tokenUnit}
              priceRate={props.priceRate}
              usdExchangeRate={props.usdExchangeRate}
              showRechargePrice={props.showRechargePrice}
              selectedGroup={sectionKey}
              perf={props.perf.get(model.model_name || '')}
              onClick={props.onModelClick}
            />
          ))}
        </div>
      ) : (
        <div className='bg-card overflow-hidden rounded-xl border'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[720px] border-collapse text-left'>
              <thead>
                <tr className='text-muted-foreground text-[11px] tracking-wide uppercase'>
                  <th scope='col' className='px-3 py-2 font-medium sm:px-4'>
                    {t('Model')}
                  </th>
                  <th scope='col' className='px-3 py-2 font-medium sm:px-4'>
                    {t('Price')}
                  </th>
                  <th scope='col' className='px-3 py-2 font-medium sm:px-4'>
                    {t('Status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.section.models.map((model) => (
                  <SectionModelRow
                    key={`${sectionKey}:${model.model_name}`}
                    model={model}
                    perf={props.perf.get(model.model_name || '')}
                    priceRate={props.priceRate}
                    usdExchangeRate={props.usdExchangeRate}
                    tokenUnit={tokenUnit}
                    showRechargePrice={props.showRechargePrice}
                    onModelClick={props.onModelClick}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
