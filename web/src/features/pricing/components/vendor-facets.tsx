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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { FILTER_ALL } from '../constants'
import type { PricingModel, PricingVendor } from '../types'

type VendorFacetsProps = {
  vendors: PricingVendor[]
  models: PricingModel[]
  value: string
  onChange: (value: string) => void
}

/**
 * One-tap vendor switch above the catalog: every vendor with models, its
 * logo and model count, in a single scrollable row. Shares the vendor filter
 * with the sidebar, so either control reflects the other.
 */
export function VendorFacets(props: VendorFacetsProps) {
  const { t } = useTranslation()

  const facets = useMemo(() => {
    const counts = new Map<string, number>()
    for (const model of props.models) {
      if (!model.vendor_name) continue
      counts.set(model.vendor_name, (counts.get(model.vendor_name) ?? 0) + 1)
    }
    return props.vendors
      .map((vendor) => ({
        name: vendor.name,
        icon: vendor.icon,
        count: counts.get(vendor.name) ?? 0,
      }))
      .filter((vendor) => vendor.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [props.models, props.vendors])

  if (facets.length < 2) return null

  const options = [
    {
      name: FILTER_ALL,
      label: t('All Vendors'),
      icon: undefined,
      count: props.models.length,
    },
    ...facets.map((facet) => ({ ...facet, label: facet.name })),
  ]

  return (
    <div
      role='group'
      aria-label={t('All Vendors')}
      className='-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden'
    >
      <ul className='flex w-max items-center gap-2 pb-1'>
        {options.map((option) => {
          const active = props.value === option.name
          return (
            <li key={option.name}>
              <button
                type='button'
                aria-pressed={active}
                onClick={() => props.onChange(option.name)}
                className={cn(
                  'focus-visible:ring-ring inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:outline-none',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background hover:border-foreground/30'
                )}
              >
                {option.icon && getLobeIcon(option.icon, 16)}
                {option.label}
                <span
                  className={cn(
                    'font-ascii text-[11px] tabular-nums',
                    active ? 'text-background/70' : 'text-muted-foreground'
                  )}
                >
                  {option.count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
