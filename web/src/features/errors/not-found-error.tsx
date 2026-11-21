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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { TermLogo } from '@/components/terminal/term-logo'
import { useScrambleText } from '@/components/terminal/use-scramble'
import { Kbd } from '@/components/ui/kbd'

/*
 * "404" drawn as a 17×5 grid of CSS cells. Not █ glyphs in a <pre>: block
 * characters fall back to other fonts and render as boxes or with gaps.
 */
const ART = [
  '#..#...###...#..#',
  '#..#..#...#..#..#',
  '####..#...#..####',
  '...#..#...#.....#',
  '...#...###......#',
]

const ART_CELLS = ART.flatMap((row, r) =>
  [...row].map((cell, c) => ({ id: `r${r}c${c}`, on: cell === '#' }))
)

function Art() {
  return (
    <div
      aria-hidden='true'
      className='grid w-fit gap-[2px]'
      style={{
        gridTemplateColumns: `repeat(${ART[0].length}, clamp(6px, 1.6vw, 11px))`,
      }}
    >
      {ART_CELLS.map((cell) => (
        <i
          key={cell.id}
          data-on={cell.on ? 'true' : undefined}
          className='bg-t-accent block aspect-[3/4] opacity-0 data-[on]:opacity-100'
        />
      ))}
    </div>
  )
}

function NfKbd(props: { children: string }) {
  return (
    <Kbd className='text-t-fg2 h-auto min-w-0 rounded-md border-0 bg-white/5 px-[5px] py-0 font-mono text-[11.5px] font-normal shadow-[inset_0_0_0_1px_var(--t-hair),0_1px_0_rgb(0_0_0/0.6)]'>
      {props.children}
    </Kbd>
  )
}

/** Not-found page: a terminal reply to `open /path` and where to go next. */
export function NotFoundError() {
  const { t } = useTranslation()
  const { history } = useRouter()
  const path = useRouterState({ select: (s) => s.location.pathname })

  useScrambleText()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (event.key === 'h') window.location.href = '/'
      else if (event.key === 'b') history.go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [history])

  const places = [
    {
      href: '/',
      label: t('Home page'),
      note: t('Pick a model, get the config'),
    },
    {
      href: '/#manual',
      label: t('Manual'),
      note: t('Address, groups, billing'),
    },
    { href: '/dashboard', label: t('Console'), note: t('Keys, logs, wallet') },
    {
      href: '/status',
      label: t('Service status'),
      note: t('Availability per group'),
    },
  ]

  return (
    <div className='bg-t-bg text-t-fg flex min-h-svh flex-col px-4'>
      <header className='border-t-line flex h-[54px] items-center gap-5 border-b'>
        <TermLogo />
        <nav
          aria-label={t('Site')}
          className='text-t-dim ml-auto flex gap-[18px] text-[13.5px]'
        >
          <a href='/#manual' data-scramble='' className='hover:text-t-fg'>
            {t('Manual')}
          </a>
          <a href='/status' data-scramble='' className='hover:text-t-fg'>
            {t('Status')}
          </a>
          <a href='/sign-in' data-scramble='' className='hover:text-t-fg'>
            {t('Sign in')}
          </a>
        </nav>
      </header>
      <main className='flex flex-1 items-center justify-center py-10'>
        <Pane
          title={
            <>
              <b>404</b>　{t('No such page')}
            </>
          }
          className='w-full max-w-[620px] gap-[22px] px-6 pt-[30px] pb-[22px]'
        >
          <Art />
          <pre className='text-t-fg2 m-0 font-mono text-[13.5px] leading-[1.9] break-all whitespace-pre-wrap'>
            <span className='text-t-dim'>$</span> open {path}
            {'\n'}
            <span className='text-t-warn'>
              peroai: {path}: {t('no such page')}
            </span>
            {'\n'}
            {t(
              'The link may be mistyped, or the page has moved. You can go to:'
            )}
          </pre>
          <nav
            aria-label={t('Where to go')}
            className='flex flex-col gap-0.5 text-sm'
          >
            {places.map((place) => (
              <a
                key={place.href}
                href={place.href}
                className='text-t-fg2 hover:bg-t-bg3 hover:text-t-fg focus-visible:bg-t-bg3 flex gap-2.5 px-2 py-1.5'
              >
                <span className='text-t-accent font-mono' aria-hidden='true'>
                  ▸
                </span>
                {place.label}
                <small className='text-t-dim ml-auto font-mono text-xs'>
                  {place.note}
                </small>
              </a>
            ))}
          </nav>
        </Pane>
      </main>
      <footer className='border-t-line text-t-dim flex h-9 items-center gap-[18px] border-t font-mono text-xs'>
        <span className='flex gap-3.5 max-md:hidden'>
          <span>
            <NfKbd>h</NfKbd> {t('Home page')}
          </span>
          <span>
            <NfKbd>b</NfKbd> {t('Go back')}
          </span>
        </span>
      </footer>
    </div>
  )
}
