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
import { Link, type LinkProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import { Button } from '@/components/ui/button'
import type { ApiKey } from '@/features/keys/types'
import { cn } from '@/lib/utils'

import { RequestPreview } from './request-preview'

/** Faint code behind the right half of the guide (decoration only). */
const CODE_PATTERN = [
  'export ANTHROPIC_BASE_URL=https://api.peroai.cc',
  'export ANTHROPIC_AUTH_TOKEN=sk-••••',
  'claude --model claude-sonnet-5-5',
  '',
  'curl https://api.peroai.cc/v1/chat/completions',
  '  -H "Authorization: Bearer sk-••••"',
  '  -d \'{"model":"gpt-6.2-astra"}\'',
].join('\n')

type GuideStep = {
  title: string
  note: string
  done: boolean
  link: Pick<LinkProps, 'to' | 'search'>
}

type StartGuideProps = {
  keyDone: boolean
  topUpDone: boolean
  requestDone: boolean
  apiKey: ApiKey | null
  base: string
  model: string
  balance: string
  onHide: () => void
}

/**
 * Overview hero after the "get started" card of the refactor/ui-v4
 * dashboard, in the console's terminal look: a pink light in the top-right
 * corner, faint code behind it, a timeline of the three steps that tick
 * themselves off, and the user's first request ready to copy.
 */
export function StartGuide(props: StartGuideProps) {
  const { t } = useTranslation()
  const steps: GuideStep[] = [
    {
      title: t('Create a key and pick its group'),
      note: t(
        'Claude and GPT need separate keys; the group sets the route and price.'
      ),
      done: props.keyDone,
      link: { to: '/keys', search: { create: true } },
    },
    {
      title: t('Top up: ¥1 buys $1 of credit'),
      note: t('Requests fail once the balance runs out.'),
      done: props.topUpDone,
      link: { to: '/wallet' },
    },
    {
      title: t('Send the first request with the configuration'),
      note: t(
        'Run the command on the right; it shows up in the logs within seconds.'
      ),
      done: props.requestDone,
      link: { to: '/usage-logs' },
    },
  ]
  const doneCount = steps.filter((step) => step.done).length
  const current = steps.findIndex((step) => !step.done)
  // The timeline fills from the first node down to the step to do next.
  const reach = current < 0 ? steps.length - 1 : current
  const fill = reach / (steps.length - 1)

  return (
    <Pane
      className='t-glow'
      title={
        <>
          <b>{t('Get started')}</b>
          {'　'}
          {t('{{done}} of {{total}} done', {
            done: doneCount,
            total: steps.length,
          })}
        </>
      }
    >
      <pre
        aria-hidden='true'
        className='t-glow-code pointer-events-none absolute top-12 right-4 m-0 hidden font-mono text-[11px] leading-5 tracking-[0.3em] whitespace-pre sm:block'
      >
        {CODE_PATTERN}
      </pre>
      <div className='relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_22rem]'>
        <div className='flex min-w-0 flex-col gap-5'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-t-dim m-0 font-mono text-xs'>
                $ peroai --setup
              </p>
              <h2 className='mt-1.5 mb-0 text-2xl font-semibold tracking-tight'>
                {t('Three steps to connect peroai')}
              </h2>
              <p className='text-t-dim mt-1.5 mb-0 text-sm'>
                {t(
                  'Create a key, top up and send the first request; each step ticks itself off.'
                )}
              </p>
            </div>
            <Button
              size='sm'
              variant='outline'
              className='rounded-full'
              onClick={props.onHide}
            >
              {t('Hide guide')}
            </Button>
          </div>

          <ol className='relative m-0 flex list-none flex-col gap-2.5 p-0'>
            <span
              aria-hidden='true'
              className='bg-t-hair absolute top-5 bottom-5 left-[15px] w-px'
            />
            <span
              aria-hidden='true'
              data-testid='guide-progress'
              className='t-grow-y from-t-ok to-t-pink absolute top-5 left-[15px] w-px bg-gradient-to-b'
              style={{ height: `calc((100% - 40px) * ${fill})` }}
            />
            {steps.map((step, index) => (
              <li
                key={step.title}
                className='t-step relative flex items-center gap-3'
                style={{ '--i': index } as React.CSSProperties}
              >
                <span
                  aria-hidden='true'
                  className={cn(
                    'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs',
                    step.done && 'border-t-ok/30 bg-t-ok/10 text-t-ok',
                    !step.done &&
                      index === current &&
                      't-node-live border-t-pink/50 bg-t-bg2 text-t-pink',
                    !step.done &&
                      index !== current &&
                      'border-t-hair bg-t-bg2 text-t-dim'
                  )}
                >
                  {step.done ? '✓' : `0${index + 1}`}
                </span>
                <Link
                  {...step.link}
                  className='group border-t-hair bg-t-bg/40 hover:bg-t-bg3 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5'
                >
                  <span className='flex min-w-0 flex-col gap-0.5'>
                    <span
                      className={cn(
                        'truncate text-sm font-medium',
                        step.done && 'text-t-dim'
                      )}
                    >
                      {step.title}
                      <span className='sr-only'>
                        {step.done ? t('(done)') : t('(to do)')}
                      </span>
                    </span>
                    <span className='text-t-dim truncate text-xs'>
                      {step.note}
                    </span>
                  </span>
                  <span
                    aria-hidden='true'
                    className='text-t-dim group-hover:text-t-fg font-mono transition-transform group-hover:translate-x-0.5'
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <RequestPreview
          apiKey={props.apiKey}
          base={props.base}
          model={props.model}
          balance={props.balance}
        />
      </div>
    </Pane>
  )
}
