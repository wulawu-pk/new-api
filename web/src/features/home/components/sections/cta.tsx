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
import { ArrowRight, Terminal } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { landingAction } from '../../constants'

interface CTAProps {
  isAuthenticated: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const command = useMemo(
    () => `export OPENAI_BASE_URL=${window.location.origin}/v1`,
    []
  )
  const [started, setStarted] = useState(false)
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (!started || reduce) return
    let index = 0
    let timer = 0
    const tick = () => {
      index += 1
      setTyped(index)
      if (index < command.length) timer = window.setTimeout(tick, 45)
    }
    timer = window.setTimeout(tick, 450)
    return () => window.clearTimeout(timer)
  }, [command, reduce, started])

  const shown = reduce ? command.length : typed

  return (
    <section
      aria-labelledby='home-cta-heading'
      className='relative z-10 px-4 py-24 sm:px-6 lg:py-28'
    >
      <div
        aria-hidden
        className='ascii-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_65%_60%_at_50%_50%,transparent_25%,black_80%)] opacity-50'
      />
      <motion.div
        onViewportEnter={() => setStarted(true)}
        viewport={{ once: true, margin: '-80px' }}
        className='border-border bg-muted/40 relative mx-auto w-full max-w-7xl overflow-hidden rounded-[32px] border'
      >
        <div className='mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center sm:px-10 sm:py-28'>
          <p className='text-muted-foreground flex items-center gap-4 text-xs font-medium tracking-[0.2em] uppercase'>
            <span aria-hidden className='font-ascii hidden sm:block'>
              //
            </span>
            <span className='inline-flex items-center gap-2'>
              <Terminal className='text-foreground size-4' aria-hidden />
              {t('Start building')}
            </span>
            <span aria-hidden className='font-ascii hidden sm:block'>
              {'\\\\'}
            </span>
          </p>

          <h2
            id='home-cta-heading'
            className='mt-8 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl'
          >
            {t('One key is all it takes.')}
          </h2>
          <p className='text-muted-foreground mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg'>
            {t(
              'Create an account, top up and send your first request with the client you already use.'
            )}
          </p>

          <div className='mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row'>
            <Link
              to={props.isAuthenticated ? '/dashboard' : '/sign-up'}
              className={landingAction.primary}
            >
              {props.isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
              <ArrowRight
                className='size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                strokeWidth={1.75}
                aria-hidden
              />
            </Link>
            <Link to='/pricing' className={landingAction.secondary}>
              {t('Browse models')}
            </Link>
          </div>

          <p className='border-border bg-background font-ascii mt-10 inline-flex max-w-full items-center gap-3 overflow-hidden rounded-full border px-5 py-2.5 text-xs'>
            <span className='text-landing-accent'>$</span>
            <span className='truncate whitespace-pre'>
              {command.slice(0, shown)}
            </span>
            <span
              aria-hidden
              className={
                shown < command.length
                  ? 'bg-foreground -ml-2 h-3.5 w-[7px] shrink-0'
                  : 'bg-foreground ascii-caret -ml-2 h-3.5 w-[7px] shrink-0'
              }
            />
          </p>
        </div>
      </motion.div>
    </section>
  )
}
