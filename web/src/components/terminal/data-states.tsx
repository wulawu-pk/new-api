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
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * The four data states of the console (normal / empty / loading / error),
 * written as terminal text inside a table or pane.
 *
 * `components/empty-state`, `loading-state` and `error-state` are not used
 * for these because they render icon-led centred cards; the spec states are
 * plain text rows inside the existing table (skeleton cells of ░, a one-line
 * reason naming the failed endpoint, and a retry button), so the table keeps
 * its frame while loading or failing.
 */

const SKELETON_WIDTHS = [6, 14, 8, 10, 8, 7, 9, 6, 8]

/** Skeleton rows: ░ runs in a pulsing faint colour. */
export function TableSkeletonRows(props: { cols: number; rows?: number }) {
  const rows = props.rows ?? 4
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} data-testid='skeleton-row' aria-hidden='true'>
          {Array.from({ length: props.cols }, (_, c) => (
            <td key={c} className='px-3.5 py-3'>
              <span className='t-skeleton font-mono'>
                {'░'.repeat(SKELETON_WIDTHS[(c + r) % SKELETON_WIDTHS.length])}
              </span>
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** A single full-width message row (empty or error). */
export function TableMessageRow(props: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td
        colSpan={props.cols}
        className='text-t-fg2 px-[18px] py-[34px] text-left text-sm leading-[1.8] whitespace-normal'
      >
        {props.children}
      </td>
    </tr>
  )
}

type ErrorTextProps = {
  /** Endpoint that failed, e.g. `/api/token/`. */
  api: string
  /** Server-provided reason, when there is one. */
  reason?: string
  onRetry?: () => void
  className?: string
}

/**
 * Error text: which endpoint failed, why, what to do, and a retry button.
 */
export function LoadErrorText(props: ErrorTextProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('text-t-fg2 text-sm leading-[1.8]', props.className)}>
      <span className='text-t-warn font-mono'>! {t('Failed to load')}</span>
      {'　'}
      {t('Request')}{' '}
      <span className='text-t-dim font-mono text-[12.5px]'>{props.api}</span>{' '}
      {props.reason
        ? t('failed: {{reason}}.', { reason: props.reason })
        : t('failed.')}{' '}
      {t('Check your network and retry; if it keeps failing, see')}{' '}
      <Link
        to='/status'
        className='text-t-fg border-t-faint hover:border-t-accent border-b'
      >
        {t('Service status')}
      </Link>
      {t('.')}
      {props.onRetry && (
        <div className='mt-3 flex flex-wrap gap-2.5'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={props.onRetry}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Pulsing skeleton text for a single value (KPI, balance). */
export function SkeletonText(props: { width?: number; className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn('t-skeleton font-mono', props.className)}
    >
      {'░'.repeat(props.width ?? 4)}
    </span>
  )
}
