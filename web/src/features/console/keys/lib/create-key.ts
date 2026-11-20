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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import type { ApiKeyFormData } from '@/features/keys/types'
import { parseQuotaFromDollars } from '@/lib/format'

export const EXPIRY_OPTIONS = ['never', '30', '90'] as const
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]

/** Create-key form schema with translated messages. */
export function getCreateKeySchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('Please enter a name'))
      .max(50, t('Name must be at most 50 characters')),
    group: z.string().min(1, t('Please select a group')),
    /** Spending cap in display currency; empty means unlimited. */
    limit: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === '' || (Number.isFinite(Number(value)) && Number(value) > 0),
        t('Enter a positive amount, or leave it empty for no limit')
      ),
    expiry: z.enum(EXPIRY_OPTIONS),
  })
}

export type CreateKeyValues = z.infer<ReturnType<typeof getCreateKeySchema>>

/** Builds the POST /api/token/ payload for a single-group key. */
export function buildCreateKeyPayload(
  values: CreateKeyValues,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): ApiKeyFormData {
  const unlimited = values.limit.trim() === ''
  let expiredTime = -1
  if (values.expiry !== 'never') {
    expiredTime = nowSeconds + Number(values.expiry) * 86400
  }
  return {
    name: values.name.trim(),
    remain_quota: unlimited ? 0 : parseQuotaFromDollars(Number(values.limit)),
    unlimited_quota: unlimited,
    expired_time: expiredTime,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    allow_user_quota_query: false,
    group: values.group,
    auto_groups: [],
    cross_group_retry: false,
  }
}

/** `sk-…03Sb` from a masked key such as `pMH8**********03Sb`. */
export function maskedKeyTail(key: string): string {
  const tail = key.replaceAll('*', '').slice(-4)
  return tail ? `sk-…${tail}` : 'sk-…'
}

/** Default name for a key created automatically after sign-up. */
export function autoKeyName(client: string | undefined, group: string): string {
  const base = (client || group).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  return base.replaceAll(/^-+|-+$/g, '').slice(0, 40) || 'my-key'
}
