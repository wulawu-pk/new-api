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
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { fetchTokenKey } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import { maskedKeyTail } from '../../keys/lib/create-key'
import { withSkPrefix } from '../../keys/lib/create-key-flow'
import { groupName } from '../../lib/groups'
import { firstRequestCurl } from '../lib/start-guide'

type RequestPreviewProps = {
  /** The key the command uses; null before the user has one. */
  apiKey: ApiKey | null
  /** API base such as https://api.peroai.cc (no trailing slash). */
  base: string
  model: string
  balance: string
}

/**
 * "First request" card of the start guide: a ready-to-run curl for the
 * user's key (masked here, real when copied) and three facts it relies on.
 * A thin light runs along its top edge, like the request card on the
 * refactor/ui-v4 dashboard.
 */
export function RequestPreview(props: RequestPreviewProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const apiKey = props.apiKey
  const shown = firstRequestCurl({
    base: props.base,
    key: apiKey ? maskedKeyTail(apiKey.key) : 'sk-…',
    model: props.model,
  })

  const copy = useMutation({
    mutationFn: async (key: ApiKey) => {
      const response = await fetchTokenKey(key.id)
      if (!response.success || !response.data?.key) {
        throw createServerError(response, t('Failed to copy'))
      }
      return firstRequestCurl({
        base: props.base,
        key: withSkPrefix(response.data.key),
        model: props.model,
      })
    },
    onSuccess: async (command) => {
      if (await copyToClipboard(command)) toast.success(t('Copied'))
      else toast.error(t('Copy failed; select and copy it manually'))
    },
    onError: (error) => handleServerError(error, t('Failed to copy')),
  })

  const facts = [
    { label: t('API address'), value: props.base.replace(/^https?:\/\//, '') },
    {
      label: t('Key group'),
      value: apiKey?.group ? groupName(apiKey.group, t) : '—',
    },
    { label: t('Balance'), value: props.balance },
  ]

  return (
    <section
      aria-label={t('First request')}
      className='t-sweep bg-t-bg/70 border-t-hair relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[14px] border p-3'
    >
      <div className='border-t-line flex items-center justify-between gap-3 border-b pb-3'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <span
            aria-hidden='true'
            className='bg-t-bg3 text-t-fg2 border-t-hair flex size-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs'
          >
            &gt;_
          </span>
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>
              {t('First request')}
            </div>
            <div className='text-t-dim truncate text-xs'>
              {apiKey
                ? apiKey.name
                : t('Create a key to fill in the real command')}
            </div>
          </div>
        </div>
        {apiKey ? (
          <Button
            size='sm'
            variant='outline'
            className='rounded-full'
            disabled={copy.isPending}
            onClick={() => copy.mutate(apiKey)}
          >
            {t('Copy command')}
          </Button>
        ) : (
          <Button
            size='sm'
            variant='outline'
            className='rounded-full'
            render={<Link to='/keys' search={{ create: true }} />}
          >
            {t('Create Key')}
          </Button>
        )}
      </div>

      <div className='rounded-[10px] bg-white/[0.03] p-3 font-mono text-xs'>
        <div aria-hidden='true' className='mb-2 flex gap-1.5'>
          <i className='bg-t-pink size-2 rounded-full' />
          <i className='bg-t-warn size-2 rounded-full' />
          <i className='bg-t-ok size-2 rounded-full' />
        </div>
        <pre className='t-type-lines text-t-dim m-0 overflow-hidden leading-5 whitespace-pre'>
          {shown.split('\n').map((line, index) => (
            <span
              key={line}
              className='block truncate'
              style={{ '--i': index } as React.CSSProperties}
            >
              {line}
            </span>
          ))}
        </pre>
      </div>

      <dl className='m-0 grid gap-1.5'>
        {facts.map((fact) => (
          <div
            key={fact.label}
            className='flex items-center justify-between gap-3 rounded-[10px] bg-white/[0.03] px-3 py-2 text-xs'
          >
            <dt className='text-t-fg2'>{fact.label}</dt>
            <dd className='text-t-dim m-0 truncate font-mono'>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
