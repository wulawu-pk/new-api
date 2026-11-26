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
import { useRouter, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { TermLogo } from '@/components/terminal/term-logo'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { cn } from '@/lib/utils'

/**
 * Error page in the console's terminal style (same frame as the 404 page):
 * the status code, a one-line shell reply and where to go next. Used for
 * 401, 403, 500 and 503 so no error leads back to the stock layout.
 */
export function TermErrorPage(props: {
  /** Big status line, e.g. "403"; omitted when there is no real status. */
  code?: string
  title: string
  description: ReactNode
  className?: string
  /** Hide the links (used when the error renders inside another page). */
  minimal?: boolean
}) {
  const { t } = useTranslation()
  const { history } = useRouter()
  const path = useRouterState({ select: (s) => s.location.pathname })

  useScrambleText()

  const places = [
    { href: '/', label: t('Home page') },
    { href: '/dashboard', label: t('Console') },
    { href: '/status', label: t('Service status') },
  ]

  return (
    <div
      className={cn(
        'bg-t-bg text-t-fg flex min-h-svh flex-col px-4',
        props.className
      )}
    >
      {!props.minimal && (
        <header className='border-t-line flex h-[54px] items-center gap-5 border-b'>
          <TermLogo />
          <nav
            aria-label={t('Site')}
            className='text-t-dim ml-auto flex gap-[18px] text-[13.5px]'
          >
            <a href='/status' data-scramble='' className='hover:text-t-fg'>
              {t('Status')}
            </a>
            <a href='/sign-in' data-scramble='' className='hover:text-t-fg'>
              {t('Sign in')}
            </a>
          </nav>
        </header>
      )}
      <main className='flex flex-1 items-center justify-center py-10'>
        <Pane title={props.title} className='w-full max-w-[620px]'>
          <div className='flex flex-col gap-[22px] px-6 pt-6 pb-[22px]'>
            {props.code && (
              <h1 className='text-t-accent m-0 font-mono text-[56px] leading-none font-semibold'>
                {props.code}
              </h1>
            )}
            <pre className='text-t-fg2 m-0 font-mono text-[13.5px] leading-[1.9] break-all whitespace-pre-wrap'>
              <span className='text-t-dim'>$</span> open {path}
              {'\n'}
              <span className='text-t-warn'>
                peroai: {path}: {props.code ?? 'error'}
              </span>
              {'\n'}
              {props.description}
            </pre>
            {!props.minimal && (
              <nav
                aria-label={t('Where to go')}
                className='flex flex-col gap-0.5 text-sm'
              >
                <button
                  type='button'
                  onClick={() => history.go(-1)}
                  className='text-t-fg2 hover:bg-t-bg3 hover:text-t-fg focus-visible:bg-t-bg3 flex gap-2.5 px-2 py-1.5 text-left'
                >
                  <span className='text-t-accent font-mono' aria-hidden='true'>
                    ▸
                  </span>
                  {t('Go back')}
                </button>
                {places.map((place) => (
                  <a
                    key={place.href}
                    href={place.href}
                    className='text-t-fg2 hover:bg-t-bg3 hover:text-t-fg focus-visible:bg-t-bg3 flex gap-2.5 px-2 py-1.5'
                  >
                    <span
                      className='text-t-accent font-mono'
                      aria-hidden='true'
                    >
                      ▸
                    </span>
                    {place.label}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </Pane>
      </main>
    </div>
  )
}
