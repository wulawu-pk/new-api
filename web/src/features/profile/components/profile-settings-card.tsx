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
import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { CONSOLE_CARD } from '@/lib/console-surface'
import { cn } from '@/lib/utils'

import type { UserProfile } from '../types'
import { NotificationTab } from './tabs/notification-tab'

// ============================================================================
// Profile Settings Card Component
// ============================================================================

interface ProfileSettingsCardProps {
  profile: UserProfile | null
  loading: boolean
  onProfileUpdate: () => void
  quotaRemindEnabled: boolean
  quotaRemindThreshold: number
}

export function ProfileSettingsCard({
  profile,
  loading,
  onProfileUpdate,
  quotaRemindEnabled,
  quotaRemindThreshold,
}: ProfileSettingsCardProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Card
        data-card-hover='false'
        className={cn(CONSOLE_CARD, 'gap-0 overflow-hidden py-0')}
      >
        <CardHeader className='border-b border-dashed p-4 !pb-4 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:p-5'>
          {['notifications', 'threshold', 'preferences'].map((key) => (
            <Skeleton key={key} className='h-20 w-full' />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Settings')}
      description={t('Settings & Preferences')}
      icon={<Settings className='h-4 w-4' />}
      iconTone='info'
      disableHoverEffect
    >
      <NotificationTab
        profile={profile}
        onUpdate={onProfileUpdate}
        quotaRemindEnabled={quotaRemindEnabled}
        quotaRemindThreshold={quotaRemindThreshold}
      />
    </TitledCard>
  )
}
