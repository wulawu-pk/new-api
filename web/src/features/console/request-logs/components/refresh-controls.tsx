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
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SPIN_FRAMES } from '@/components/terminal/lib'
import { TERM_BUTTON } from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Rotating | / - \\ while a refresh runs, as the auth buttons do. */
function Spinner(props: { spinning: boolean }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!props.spinning) return
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % SPIN_FRAMES.length),
      90
    )
    return () => window.clearInterval(timer)
  }, [props.spinning])
  return (
    <span aria-hidden className='inline-block w-[1ch] font-mono'>
      {props.spinning ? SPIN_FRAMES[frame] : '↻'}
    </span>
  )
}

/**
 * Live-update switch, last-updated time and a refresh button for the
 * usage-log page header.
 */
export function RefreshControls(props: {
  live: boolean
  onLiveChange: (live: boolean) => void
  /** Live updates only run on the first page; later pages say so. */
  livePaused: boolean
  fetching: boolean
  /** ms timestamp of the last successful load, 0 before the first one. */
  updatedAt: number
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex flex-wrap items-center gap-3 text-[13px]'>
      {props.updatedAt > 0 && (
        <span className='text-t-dim font-mono text-xs' aria-live='polite'>
          {t('Updated {{time}}', {
            time: dayjs(props.updatedAt).format('HH:mm:ss'),
          })}
        </span>
      )}
      <label
        className='text-t-fg2 inline-flex cursor-pointer items-center gap-2'
        title={
          props.livePaused
            ? t('Live updates run on the first page only')
            : t('New requests appear on their own every 10 seconds')
        }
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            props.live && !props.livePaused ? 't-live bg-t-ok' : 'bg-t-faint'
          )}
        />
        {t('Live updates')}
        <Switch
          size='sm'
          checked={props.live}
          onCheckedChange={props.onLiveChange}
        />
      </label>
      <Button
        size='sm'
        variant='outline'
        className={cn(TERM_BUTTON, 'gap-1.5 py-1.5')}
        aria-busy={props.fetching || undefined}
        onClick={props.onRefresh}
      >
        <Spinner spinning={props.fetching} />
        {t('Refresh')}
      </Button>
    </div>
  )
}
