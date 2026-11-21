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
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { useCssColors } from '@/hooks/use-css-colors'

import { EASE, LANDING_COLOR_VARS, landingAction } from '../../constants'
import { useShowcaseModels } from '../../hooks/use-showcase-models'
import { ModelPalette } from '../model-palette'

// WebGL glyph field pulls in three.js; keep it out of the main bundle.
const GlyphSonar = lazy(() => import('@/components/react-bits/glyph-sonar'))

interface HeroProps {
  isAuthenticated: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const showcase = useShowcaseModels()
  const colors = useCssColors(LANDING_COLOR_VARS)

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
  }
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  }
  const headline: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24, filter: 'blur(8px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.75, ease: EASE },
    },
  }

  return (
    <section className='relative z-10 flex min-h-[100svh] w-full items-start overflow-hidden px-4 pt-28 pb-20 sm:px-6 lg:pt-32'>
      <div aria-hidden className='pointer-events-none absolute inset-0 -z-10'>
        <div className='ascii-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent)] opacity-50' />
        <div className='absolute inset-x-0 top-[38%] h-[70%] [mask-image:radial-gradient(ellipse_55%_60%_at_50%_45%,black_20%,transparent_75%)] opacity-70'>
          <Suspense fallback={null}>
            <GlyphSonar
              className='size-full'
              colors={[colors.accent, colors.foreground]}
              backgroundColor={colors.background}
              originX={0.5}
              originY={0.35}
              glyphSize={13}
              interval={3.4}
              intensity={0.8}
              interactive={false}
              clickPing={false}
            />
          </Suspense>
        </div>
      </div>

      <motion.div
        variants={container}
        initial='hidden'
        animate='show'
        className='mx-auto flex w-full max-w-7xl flex-col items-center text-center'
      >
        <motion.p
          variants={item}
          className='border-border bg-background/80 inline-flex items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 shadow-xs backdrop-blur'
        >
          <span className='bg-foreground text-background font-ascii rounded-full px-2.5 py-0.5 text-[11px]'>
            1 key
          </span>
          <span className='text-muted-foreground text-xs font-medium sm:text-sm'>
            {t('API Proxy Center')}
          </span>
        </motion.p>

        <motion.h1
          variants={headline}
          className='mt-8 max-w-4xl text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance'
        >
          <span className='block'>{t('One key.')}</span>
          <span className='text-muted-foreground block'>
            {t('Every model.')}
          </span>
        </motion.h1>

        <motion.p
          variants={item}
          className='text-muted-foreground mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg'
        >
          {t(
            'One API key and one base URL in front of every upstream provider. Call any model by name with the client you already use.'
          )}
        </motion.p>

        <motion.div
          variants={item}
          className='mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row'
        >
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
        </motion.div>

        <motion.div
          variants={item}
          className='mt-12 flex w-full justify-center'
        >
          <ModelPalette
            models={showcase.models}
            vendors={showcase.vendors}
            isLive={showcase.isLive}
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
