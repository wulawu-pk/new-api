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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

/** Fired on `document` after the interface language changes (detail: code). */
export const LANGUAGE_EVENT = 'peroai:lang'

/**
 * Switches the interface language. i18next stores the choice in
 * localStorage (`i18nextLng`, shared with the beta landing page and docs);
 * for a signed-in user it is also saved to the account, best effort.
 * Shared by the language menu and the console's 中 / EN switch.
 */
export function useChangeLanguage(): (code: string) => Promise<void> {
  const { i18n } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  return useCallback(
    async (code: string) => {
      await i18n.changeLanguage(code)
      document.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: code }))
      if (!user) return
      try {
        await api.put('/api/user/self', { language: code })
      } catch {
        // Best-effort persistence; don't block the UI on failure
      }
    },
    [i18n, user]
  )
}
