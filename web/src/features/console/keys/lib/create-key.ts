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

import type { ApiKey, ApiKeyFormData } from '@/features/keys/types'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

/** `keep` is only offered when editing a key that already has a date. */
export const EXPIRY_OPTIONS = ['keep', 'never', '30', '90'] as const
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
  return {
    name: values.name.trim(),
    remain_quota: unlimited ? 0 : parseQuotaFromDollars(Number(values.limit)),
    unlimited_quota: unlimited,
    expired_time: expiredTimeFor(values.expiry, nowSeconds, -1),
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    allow_user_quota_query: false,
    group: values.group,
    auto_groups: [],
    cross_group_retry: false,
  }
}

/** Unix expiry for the chosen option; `keep` returns the key's current one. */
function expiredTimeFor(
  expiry: ExpiryOption,
  nowSeconds: number,
  current: number
): number {
  if (expiry === 'keep') return current
  if (expiry === 'never') return -1
  return nowSeconds + Number(expiry) * 86400
}

/** Form values for editing an existing key. */
export function editKeyValues(key: ApiKey): CreateKeyValues {
  let limit = ''
  if (!key.unlimited_quota) {
    // Round to cents so the field shows `12.5`, not `12.500000001`.
    limit = String(
      Math.round(quotaUnitsToDollars(key.remain_quota) * 100) / 100
    )
  }
  return {
    name: key.name,
    group: key.group || '',
    limit,
    expiry: key.expired_time === -1 ? 'never' : 'keep',
  }
}

/**
 * Builds the PUT /api/token/ payload. The endpoint overwrites every field, so
 * settings this form does not show (model limits, IP allow-list, auto groups,
 * quota query) are carried over from the key unchanged.
 */
export function buildUpdateKeyPayload(
  key: ApiKey,
  values: CreateKeyValues,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): ApiKeyFormData & { id: number } {
  const unlimited = values.limit.trim() === ''
  // An untouched quota field sends the exact quota, not the rounded figure.
  let remainQuota = 0
  if (values.limit.trim() === editKeyValues(key).limit) {
    remainQuota = key.remain_quota
  } else if (!unlimited) {
    remainQuota = parseQuotaFromDollars(Number(values.limit))
  }
  return {
    id: key.id,
    name: values.name.trim(),
    remain_quota: remainQuota,
    unlimited_quota: unlimited,
    expired_time: expiredTimeFor(values.expiry, nowSeconds, key.expired_time),
    model_limits_enabled: key.model_limits_enabled,
    model_limits: key.model_limits ?? '',
    allow_ips: key.allow_ips ?? '',
    allow_user_quota_query: key.allow_user_quota_query,
    group: values.group,
    auto_groups: key.auto_groups ?? [],
    cross_group_retry: key.cross_group_retry,
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
