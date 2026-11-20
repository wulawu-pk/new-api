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
import { forwardRef, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Kbd } from '@/components/ui/kbd'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { Pane } from './pane'
import { RelayCanvas, type RelayCanvasRef } from './relay-canvas'
import { TermLogo } from './term-logo'

type TerminalAuthFrameProps = {
  /** Title on the dialog's border, e.g. "peroai 登录". */
  title: ReactNode
  children: ReactNode
  /** Extra classes for the dialog pane (shake / CRT effects). */
  boxClassName?: string
  /** Disable Esc → home while a request is running. */
  busy?: boolean
  relayRef?: React.Ref<RelayCanvasRef>
}

function FrameKbd(props: { children: ReactNode }) {
  return (
    <Kbd className='border-t-faint text-t-fg2 h-auto min-w-0 rounded-[2px] border border-b-2 bg-transparent px-[5px] py-0 font-mono text-[11.5px] font-normal'>
      {props.children}
    </Kbd>
  )
}

/**
 * Sign-in style page: the landing page's relay animation (dimmed) behind a
 * single dialog pane, a thin top bar and a status bar with the keys.
 */
export const TerminalAuthFrame = forwardRef<
  HTMLDivElement,
  TerminalAuthFrameProps
>(function TerminalAuthFrame(props, boxRef) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const busy = props.busy

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return
      }
      window.location.href = '/'
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy])

  return (
    <div className='bg-t-bg text-t-fg relative h-svh min-h-[640px] overflow-hidden'>
      <RelayCanvas
        ref={props.relayRef}
        className='absolute inset-0 opacity-45'
      />
      <div className='text-t-dim absolute top-0 right-4 left-4 z-[3] flex h-[54px] items-center justify-between text-[13px]'>
        <TermLogo />
        <a href='/' data-scramble='' className='hover:text-t-fg'>
          {t('Back to home')}
        </a>
      </div>
      <div className='absolute inset-x-0 top-[54px] bottom-9 z-[3] flex items-center justify-center overflow-auto px-4 py-6'>
        <div
          ref={boxRef}
          className={cn('w-full max-w-[400px]', props.boxClassName)}
        >
          <Pane
            title={props.title}
            active
            className='bg-t-bg [&>.t-pane-title]:text-t-fg gap-4 px-6 pt-7 pb-[22px]'
          >
            {props.children}
          </Pane>
        </div>
      </div>
      <footer className='border-t-line bg-t-bg text-t-dim absolute right-4 bottom-0 left-4 z-[3] flex h-9 items-center gap-[18px] overflow-hidden border-t font-mono text-xs whitespace-nowrap'>
        <span className='flex items-center gap-3.5 max-md:hidden'>
          <span>
            <FrameKbd>Tab</FrameKbd> {t('Next field')}
          </span>
          <span>
            <FrameKbd>Enter</FrameKbd> {t('Submit')}
          </span>
          <span>
            <FrameKbd>Esc</FrameKbd> {t('Back to home')}
          </span>
        </span>
        <span className='ml-auto'>
          <span
            className={status ? 'text-t-ok' : 'text-t-warn'}
            aria-hidden='true'
          >
            ●
          </span>{' '}
          {status ? t('Service online') : t('connecting')}
        </span>
      </footer>
    </div>
  )
})
