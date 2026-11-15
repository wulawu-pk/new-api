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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { requireServerSuccess } from '@/lib/server-error-message'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { getPricing } from '../api'
import { formatCreditGroupLabel } from '../lib/group-sections'
import type { PricingModel } from '../types'

const NO_MODELS: PricingModel[] = []

/**
 * Per-credit labels for credit-billed groups outside the model square.
 *
 * Pages that list a customer's groups (API keys) only know each group's
 * multiplier. This reads the public `/api/pricing` payload through the model
 * square's own cached query and returns a resolver: `$0.25 / credit` for a
 * credit-billed group, null for every other group so callers keep the
 * multiplier.
 */
export function useCreditGroupLabel(): (
  group: string,
  ratio: number | string | null | undefined
) => string | null {
  const { t } = useTranslation()
  const currency = useSystemConfigStore((state) => state.config.currency)
  const { data } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 5 * 60 * 1000,
  })
  const models = Array.isArray(data?.data) ? data.data : NO_MODELS

  return useCallback(
    (group, ratio) => {
      const numeric = typeof ratio === 'string' ? Number(ratio) : ratio
      // An automatic or unknown multiplier has no single per-credit price.
      if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null
      return formatCreditGroupLabel(
        models,
        group,
        { [group]: numeric },
        t('credit')
      )
    },
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [models, t, currency]
  )
}
