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
import { useMemo } from 'react'

import { getPricing } from '@/features/pricing/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { FALLBACK_MODELS } from '../constants'

export type ShowcaseModel = {
  name: string
  vendor: string
  icon?: string
  endpoints: string[]
}

export type ShowcaseVendor = {
  name: string
  icon?: string
  count: number
}

/**
 * Models offered by this instance for the landing page. Reads the public
 * pricing catalog; when the catalog is empty, gated behind sign-in, or
 * unreachable, falls back to a curated list so the page never renders blank.
 */
export function useShowcaseModels() {
  const { data, isSuccess } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  return useMemo(() => {
    const vendorById = new Map((data?.vendors ?? []).map((v) => [v.id, v]))
    const live: ShowcaseModel[] = (data?.data ?? []).map((model) => {
      const vendor = model.vendor_id
        ? vendorById.get(model.vendor_id)
        : undefined
      return {
        name: model.model_name,
        vendor: vendor?.name ?? '',
        icon: model.icon || vendor?.icon,
        endpoints: model.supported_endpoint_types ?? [],
      }
    })
    const isLive = isSuccess && live.length > 0
    const models = isLive ? live : FALLBACK_MODELS

    const counts = new Map<string, ShowcaseVendor>()
    for (const model of models) {
      if (!model.vendor) continue
      const entry = counts.get(model.vendor)
      if (entry) {
        entry.count += 1
        continue
      }
      counts.set(model.vendor, {
        name: model.vendor,
        icon: model.icon,
        count: 1,
      })
    }
    const vendors = [...counts.values()].sort((a, b) => b.count - a.count)

    return { models, vendors, isLive }
  }, [data, isSuccess])
}
