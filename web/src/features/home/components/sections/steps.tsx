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
import { Check, MoveRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

// Illustrative values: the visuals show the shape of each step.
const KEY_FIELDS = [
  ['name', 'my-app'],
  ['quota', '$20.00'],
  ['models', 'all'],
  ['expires', 'never'],
]

const USAGE_ROWS = [
  ['claude-sonnet-4-5', '1,284', '$0.0193'],
  ['gpt-4.1', '962', '$0.0077'],
  ['gemini-2.5-flash', '2,410', '$0.0014'],
]

export function Steps() {
  const { t } = useTranslation()
  const reduce = useReducedMotion()

  const envMappings = useMemo(() => {
    const origin = window.location.origin
    return [
      ['OPENAI_BASE_URL', `${origin}/v1`],
      ['ANTHROPIC_BASE_URL', origin],
      ['API_KEY', 'sk-••••••••'],
    ]
  }, [])

  const steps: { title: string; body: string; visual: ReactNode }[] = [
    {
      title: t('Create an API key'),
      body: t(
        'Sign up, top up your balance and create a key. Limit it by quota, models or expiry when you need to.'
      ),
      visual: (
        <div className='flex h-full flex-col justify-center gap-1.5'>
          {KEY_FIELDS.map(([label, value]) => (
            <div
              key={label}
              className='border-border bg-background flex items-center justify-between rounded-lg border px-3 py-2 text-xs'
            >
              <span className='text-muted-foreground'>{label}</span>
              <span className='font-ascii'>{value}</span>
            </div>
          ))}
          <div className='bg-foreground text-background font-ascii flex items-center justify-between rounded-lg px-3 py-2 text-xs'>
            sk-••••••••
            <Check className='text-landing-accent size-3.5' />
          </div>
        </div>
      ),
    },
    {
      title: t('Set the base URL'),
      body: t(
        'Point your SDK, Claude Code, Cherry Studio or any compatible client at this gateway.'
      ),
      visual: (
        <div className='flex h-full flex-col justify-center gap-2.5'>
          {envMappings.map(([name, value]) => (
            <div
              key={name}
              className='grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2'
            >
              <span className='border-border bg-background font-ascii rounded-lg border px-2.5 py-2 text-[11px]'>
                {name}
              </span>
              <MoveRight className='text-muted-foreground size-3.5' />
              <span className='border-border bg-background font-ascii text-landing-accent truncate rounded-lg border px-2.5 py-2 text-[11px]'>
                {value}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: t('Call any model'),
      body: t(
        'Pick a model by name. Every request lands in your usage log with tokens and cost.'
      ),
      visual: (
        <div className='flex h-full flex-col justify-center gap-3'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>{t('Usage log')}</span>
            <span className='bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium'>
              <span className='bg-landing-accent size-1.5 rounded-full' />
              {t('Live')}
            </span>
          </div>
          <dl className='flex flex-col gap-1.5'>
            {USAGE_ROWS.map(([model, tokens, cost]) => (
              <div
                key={model}
                className='font-ascii flex items-center justify-between gap-3 text-[11px]'
              >
                <dt className='truncate'>{model}</dt>
                <dd className='text-muted-foreground ml-auto tabular-nums'>
                  {tokens} tok
                </dd>
                <dd className='w-14 text-right tabular-nums'>{cost}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
  ]

  return (
    <section
      aria-labelledby='home-steps-heading'
      className='relative z-10 px-4 py-24 sm:px-6 lg:py-28'
    >
      <div className='mx-auto w-full max-w-7xl'>
        <div className='mx-auto max-w-2xl text-center'>
          <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
            [ {t('How It Works')} ]
          </p>
          <h2
            id='home-steps-heading'
            className='leading-heading mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl'
          >
            {t('From sign-up to first request in three steps')}
          </h2>
        </div>

        <ol className='mt-14 grid list-none grid-cols-1 gap-12 lg:mt-20 lg:grid-cols-3 lg:gap-x-12'>
          {steps.map((step, index) => {
            const isFirst = index === 0
            const isLast = index === steps.length - 1
            const segment = cn(
              isFirst ? 'left-0' : '-left-6',
              isLast ? 'right-0' : '-right-6'
            )
            return (
              <li
                key={step.title}
                className='border-border border-t pt-10 first:border-t-0 first:pt-0 lg:border-t-0 lg:pt-0'
              >
                <div
                  aria-hidden
                  className='border-border bg-muted/40 rounded-2xl border p-4 lg:h-56'
                >
                  {step.visual}
                </div>
                <div className='relative mt-8 flex h-10 items-center'>
                  <div
                    aria-hidden
                    className={cn(
                      'bg-border absolute top-1/2 hidden h-px -translate-y-1/2 lg:block',
                      segment
                    )}
                  />
                  <motion.div
                    aria-hidden
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{
                      duration: 0.35,
                      delay: 0.3 + index * 0.35,
                      ease: 'linear',
                    }}
                    className={cn(
                      'bg-landing-accent absolute top-1/2 hidden h-px origin-left -translate-y-1/2 lg:block',
                      segment
                    )}
                  />
                  <span className='bg-foreground text-background font-ascii relative z-10 flex size-10 items-center justify-center rounded-full text-sm font-medium'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className='mt-6 text-xl font-semibold tracking-tight text-balance sm:text-2xl'>
                  {step.title}
                </h3>
                <p className='text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed sm:text-[15px]'>
                  {step.body}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
