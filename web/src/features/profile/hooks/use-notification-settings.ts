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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'

import { updateUserSettings } from '../api'
import { normalizeUserSettings } from '../lib/user-settings'
import type { UserProfile } from '../types'

export type NotificationSettings = ReturnType<typeof normalizeUserSettings>

/**
 * Form state and save action for the notification and preference settings
 * (notify method, low-balance reminder, admin notifications, unpriced
 * models). Shared by the profile settings card and the console account
 * page. IP recording is saved by the privacy card, so it is left out of
 * this save.
 */
export function useNotificationSettings(
  profile: UserProfile | null,
  onUpdate: () => void
) {
  const { t } = useTranslation()
  const role = profile?.role ?? 0
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(() => normalizeUserSettings())
  const [thresholdInput, setThresholdInput] = useState('')

  const updateField = useCallback(
    <K extends keyof NotificationSettings>(
      field: K,
      value: NotificationSettings[K]
    ) => {
      setSettings((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  useEffect(() => {
    if (profile?.setting) {
      const next = normalizeUserSettings(profile.setting)
      setSettings(next)
      // 0 means the site default and shows as an empty input.
      setThresholdInput(
        next.quota_warning_threshold
          ? String(quotaUnitsToDollars(next.quota_warning_threshold))
          : ''
      )
    }
  }, [profile])

  /** The threshold is typed in dollars and stored in quota units. */
  const changeThreshold = useCallback(
    (value: string) => {
      setThresholdInput(value)
      updateField(
        'quota_warning_threshold',
        value.trim() === '' ? 0 : parseQuotaFromDollars(Number(value))
      )
    },
    [updateField]
  )

  const save = async () => {
    try {
      setSaving(true)
      const { record_ip_log: _recordIpLog, ...notificationSettings } = settings
      const response = await updateUserSettings(notificationSettings)

      if (response.success) {
        toast.success(t('Settings updated successfully'))
        onUpdate()
      } else {
        handleServerError(response, t('Failed to update settings'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to update settings'))
    } finally {
      setSaving(false)
    }
  }

  return {
    settings,
    updateField,
    thresholdInput,
    changeThreshold,
    saving,
    save,
    isAdmin: role >= ROLE.ADMIN,
    // Switches the user never chose: reminders stay on, and root alone gets
    // channel notifications.
    quotaWarningEnabled: settings.quota_warning_enabled ?? true,
    channelNotifyEnabled:
      settings.channel_notify_enabled ?? role >= ROLE.SUPER_ADMIN,
  }
}
