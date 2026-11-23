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
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2, MessageCircleWarning } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { useActiveChatKey } from '@/features/chat/hooks/use-active-chat-key'
import { useChatPresets } from '@/features/chat/hooks/use-chat-presets'
import {
  chatLinkRequiresApiKey,
  resolveChatUrl,
} from '@/features/chat/lib/chat-links'
import { CONSOLE_FRAME } from '@/lib/console-surface'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/chat/$chatId')({
  loader: async ({ params }) => {
    if (!Number.isInteger(Number(params.chatId))) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: ChatRouteComponent,
})

function ChatRouteComponent() {
  const { t } = useTranslation()
  const { chatId } = Route.useParams()
  const { chatPresets, serverAddress } = useChatPresets()
  const preset = useMemo(() => {
    const index = Number(chatId)
    if (!Number.isInteger(index)) return undefined
    return chatPresets[index]
  }, [chatId, chatPresets])

  const isWebLink = preset?.type === 'web'

  const requiresActiveKey = useMemo(() => {
    if (!preset || !isWebLink) return false
    return chatLinkRequiresApiKey(preset.url ?? '')
  }, [isWebLink, preset])

  const {
    data: activeKey,
    isPending,
    isError,
    error,
  } = useActiveChatKey(Boolean(preset && requiresActiveKey))

  const iframeSrc = useMemo(() => {
    if (!preset || !isWebLink) return ''
    if (requiresActiveKey && !activeKey) return ''
    return resolveChatUrl({
      template: preset.url,
      apiKey: requiresActiveKey ? activeKey : undefined,
      serverAddress,
    })
  }, [activeKey, isWebLink, preset, requiresActiveKey, serverAddress])

  const returnAction = (
    <Button
      variant='outline'
      className='rounded-full px-4'
      render={<Link to='/dashboard' />}
    >
      {t('Return to dashboard')}
    </Button>
  )

  if (!preset) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <EmptyState
          icon={MessageCircleWarning}
          title={t('Chat preset not found')}
          description={t(
            'The requested chat preset does not exist or has been removed.'
          )}
          action={returnAction}
          className={cn(CONSOLE_FRAME, 'w-full max-w-xl border-solid')}
        />
      </div>
    )
  }

  if (!isWebLink) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <EmptyState
          icon={MessageCircleWarning}
          title={t('Use sidebar shortcut')}
          description={`${preset.name} ${t(
            'opens in an external client. Trigger it from the sidebar or API key actions to launch the configured application.'
          )}`}
          action={returnAction}
          className={cn(CONSOLE_FRAME, 'w-full max-w-xl border-solid')}
        />
      </div>
    )
  }

  if (requiresActiveKey && isPending) {
    return (
      <div
        role='status'
        className='flex h-full flex-col items-center justify-center gap-3'
      >
        <Loader2 className='text-landing-accent size-6 animate-spin' />
        <p className='font-ascii text-muted-foreground flex items-center gap-1.5 text-xs'>
          <span aria-hidden className='text-landing-accent'>
            $
          </span>
          {t('Preparing your chat link…')}
          <span aria-hidden className='ascii-caret'>
            _
          </span>
        </p>
      </div>
    )
  }

  if (requiresActiveKey && (isError || !activeKey || !iframeSrc)) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to generate chat link. Please check your API keys.'
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <ErrorState
          title={t('Unable to open chat')}
          description={message}
          action={returnAction}
          className={cn(CONSOLE_FRAME, 'w-full max-w-xl border-solid')}
        />
      </div>
    )
  }

  if (!requiresActiveKey && !iframeSrc) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <ErrorState
          title={t('Unable to open chat')}
          description={t(
            'Unable to generate chat link. Please contact your administrator.'
          )}
          action={returnAction}
          className={cn(CONSOLE_FRAME, 'w-full max-w-xl border-solid')}
        />
      </div>
    )
  }

  return (
    <iframe
      src={iframeSrc}
      key={iframeSrc}
      className='h-full w-full border-0'
      allow='camera; microphone'
      title={`Chat preset: ${preset.name}`}
    />
  )
}
