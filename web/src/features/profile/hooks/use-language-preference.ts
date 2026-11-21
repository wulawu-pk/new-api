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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { normalizeInterfaceLanguage } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { updateUserLanguage } from '../api'
import { parseUserSettings } from '../lib'
import type { UserProfile } from '../types'

/**
 * The interface language saved on the account. Changing it switches the UI
 * at once, saves it to the server and rolls back if the save fails. Shared
 * by the profile language card and the console account page.
 */
export function useLanguagePreference(
  profile: UserProfile | null,
  onProfileUpdate: () => void
) {
  const { t, i18n } = useTranslation()
  const { auth } = useAuthStore()
  const [saving, setSaving] = useState(false)

  const savedLanguage = useMemo(() => {
    const settings = parseUserSettings(profile?.setting)
    return normalizeInterfaceLanguage(settings.language || i18n.language)
  }, [profile?.setting, i18n.language])

  const [language, setLanguage] = useState(savedLanguage)

  useEffect(() => {
    setLanguage(savedLanguage)
  }, [savedLanguage])

  const changeLanguage = async (next: string | null) => {
    if (!next) return
    const nextLanguage = normalizeInterfaceLanguage(next)
    if (nextLanguage === language) return

    const previousLanguage = language
    setLanguage(nextLanguage)
    setSaving(true)
    await i18n.changeLanguage(nextLanguage)

    try {
      const response = await updateUserLanguage(nextLanguage)
      if (!response.success) {
        throw createServerError(response, t('Failed to update settings'))
      }

      if (auth.user) {
        const existingSetting =
          typeof auth.user.setting === 'string'
            ? parseUserSettings(auth.user.setting)
            : (auth.user.setting ?? {})
        auth.setUser({
          ...auth.user,
          setting: JSON.stringify({
            ...existingSetting,
            language: nextLanguage,
          }),
        })
      }

      onProfileUpdate()
      toast.success(t('Language preference saved'))
    } catch (error) {
      setLanguage(previousLanguage)
      await i18n.changeLanguage(previousLanguage)
      handleServerError(error, t('Failed to update settings'))
    } finally {
      setSaving(false)
    }
  }

  return { language, saving, changeLanguage }
}
