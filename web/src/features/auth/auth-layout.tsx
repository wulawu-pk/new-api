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
import { ArrowLeft } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { TerminalStep } from '@/components/react-bits/terminal-replay'
import { Skeleton } from '@/components/ui/skeleton'
import { LANDING_COLOR_VARS } from '@/features/home/constants'
import { useCssColors } from '@/hooks/use-css-colors'
import { useSystemConfig } from '@/hooks/use-system-config'

const GlyphSonar = lazy(() => import('@/components/react-bits/glyph-sonar'))
const TerminalReplay = lazy(
  () => import('@/components/react-bits/terminal-replay')
)

const SHOWCASE_MODELS = [
  'gpt-4o',
  'claude-sonnet-4-5',
  'gemini-2.5-pro',
  'deepseek-chat',
  'qwen-max',
]

type AuthLayoutProps = {
  children: React.ReactNode
}

/** One key against this gateway, two vendors' models, same request shape. */
function gatewaySession(origin: string): TerminalStep[] {
  return [
    { type: 'command', text: `export OPENAI_BASE_URL=${origin}/v1` },
    { type: 'command', text: 'export OPENAI_API_KEY=sk-••••••••••••' },
    {
      type: 'command',
      text: 'curl $OPENAI_BASE_URL/chat/completions -d \'{"model":"claude-sonnet-4-5"}\'',
    },
    {
      type: 'spinner',
      text: 'routing → anthropic',
      duration: 1100,
      done: '[success]200[/] [muted]claude-sonnet-4-5 · 412 ms[/]',
    },
    {
      type: 'command',
      text: 'curl $OPENAI_BASE_URL/chat/completions -d \'{"model":"gemini-2.5-pro"}\'',
    },
    {
      type: 'spinner',
      text: 'routing → google',
      duration: 900,
      done: '[success]200[/] [muted]gemini-2.5-pro · 386 ms[/]',
    },
    {
      type: 'output',
      lines: [
        '',
        '[accent]●[/] [muted]same key · same endpoint · usage billed[/]',
      ],
    },
  ]
}

function GatewayPanel() {
  const { t } = useTranslation()
  const colors = useCssColors(LANDING_COLOR_VARS)
  const script = useMemo(() => gatewaySession(window.location.origin), [])

  return (
    <aside className='border-border bg-muted/30 relative hidden overflow-hidden rounded-3xl border lg:flex lg:flex-col'>
      <div aria-hidden className='pointer-events-none absolute inset-0'>
        <div className='ascii-grid absolute inset-0 opacity-40' />
        <div className='absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,black_25%,transparent_80%)] opacity-70'>
          <Suspense fallback={null}>
            <GlyphSonar
              className='size-full'
              colors={[colors.accent, colors.foreground]}
              backgroundColor={colors.background}
              originX={0.5}
              originY={0.42}
              glyphSize={13}
              interval={3.8}
              intensity={0.7}
              interactive={false}
              clickPing={false}
            />
          </Suspense>
        </div>
      </div>

      <div className='relative flex flex-1 flex-col justify-between gap-10 p-10 xl:p-12'>
        <div>
          <p className='font-ascii text-muted-foreground text-xs'>
            [ {t('API Proxy Center')} ]
          </p>
          <p className='mt-5 text-4xl font-semibold tracking-tight text-balance xl:text-5xl'>
            <span className='block'>{t('One key.')}</span>
            <span className='text-muted-foreground block'>
              {t('Every model.')}
            </span>
          </p>
          <p className='text-muted-foreground mt-4 max-w-md text-sm leading-relaxed text-pretty'>
            {t(
              'Point your SDK, Claude Code, Cherry Studio or any compatible client at this gateway.'
            )}
          </p>
        </div>

        <Suspense
          fallback={
            <Skeleton className='bg-background/60 h-[244px] rounded-2xl' />
          }
        >
          <TerminalReplay
            script={script}
            title='~/gateway'
            chrome='window'
            dots='mono'
            theme='auto'
            accentColor={colors.accent}
            fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
            fontSize={12.5}
            height={244}
            radius={16}
            typingSpeed={38}
            hold={4200}
            loop
            copyable={false}
            className='shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]'
          />
        </Suspense>

        <ul
          aria-label={t('Models')}
          className='font-ascii text-muted-foreground flex flex-wrap gap-2 text-[11px]'
        >
          {SHOWCASE_MODELS.map((model) => (
            <li
              key={model}
              className='border-border bg-background/70 rounded-full border px-2.5 py-1 backdrop-blur'
            >
              {model}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export function AuthLayout(props: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const year = new Date().getFullYear()

  return (
    <div className='bg-background relative grid min-h-svh gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
      <div className='flex min-h-[calc(100svh-1.5rem)] flex-col'>
        <header className='flex items-center justify-between gap-4 px-2 pt-2 sm:px-5 sm:pt-4'>
          <Link
            to='/'
            className='focus-visible:ring-ring flex items-center gap-2.5 rounded-lg transition-opacity outline-none hover:opacity-80 focus-visible:ring-2'
          >
            <span className='relative size-8'>
              {loading ? (
                <Skeleton className='absolute inset-0 rounded-lg' />
              ) : (
                <img
                  src={logo}
                  alt={t('Logo')}
                  className='size-8 rounded-lg object-cover'
                />
              )}
            </span>
            {loading ? (
              <Skeleton className='h-5 w-24' />
            ) : (
              <span className='text-base font-semibold tracking-tight'>
                {systemName}
              </span>
            )}
          </Link>
          <Link
            to='/'
            className='font-ascii text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors outline-none focus-visible:ring-2'
          >
            <ArrowLeft aria-hidden className='size-3.5' />
            {t('Back to Home')}
          </Link>
        </header>

        <main className='flex flex-1 items-center justify-center px-2 py-10 sm:px-5'>
          <div className='w-full max-w-[400px]'>{props.children}</div>
        </main>

        <footer className='font-ascii text-muted-foreground flex items-center justify-between gap-4 px-2 pb-2 text-[11px] sm:px-5 sm:pb-4'>
          <span>
            © {year} {systemName}
          </span>
          <span aria-hidden className='inline-flex items-center gap-1.5'>
            <span className='bg-landing-accent size-1.5 rounded-full' />
            tls · session
            <span className='ascii-caret'>_</span>
          </span>
        </footer>
      </div>

      <GatewayPanel />
    </div>
  )
}
