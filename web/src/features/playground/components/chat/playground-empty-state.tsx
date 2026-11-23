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
import {
  ArrowRight,
  BarChartIcon,
  CodeSquareIcon,
  GraduationCapIcon,
  NotepadTextIcon,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { LANDING_COLOR_VARS } from '@/features/home/constants'
import { useCssColors } from '@/hooks/use-css-colors'

// WebGL glyph field pulls in three.js; keep it out of the playground chunk.
const GlyphSonar = lazy(() => import('@/components/react-bits/glyph-sonar'))

type PlaygroundEmptyStateProps = {
  onSelectPrompt: (prompt: string) => void
}

const starterPrompts = [
  { icon: BarChartIcon, text: 'Analyze data' },
  { icon: NotepadTextIcon, text: 'Summarize text' },
  { icon: CodeSquareIcon, text: 'Code' },
  { icon: GraduationCapIcon, text: 'Get advice' },
]

/** First screen of the playground over the landing page's ASCII sonar. */
export function PlaygroundEmptyState({
  onSelectPrompt,
}: PlaygroundEmptyStateProps) {
  const { t } = useTranslation()
  const colors = useCssColors(LANDING_COLOR_VARS)

  return (
    <div className='relative flex min-h-[min(520px,calc(100svh-18rem))] items-center justify-center px-1 py-8 md:py-12'>
      <div aria-hidden className='pointer-events-none absolute inset-0'>
        <div className='ascii-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)] opacity-30' />
        <div className='absolute inset-0 hidden [mask-image:radial-gradient(ellipse_55%_50%_at_50%_42%,black_15%,transparent_75%)] opacity-60 md:block'>
          <Suspense fallback={null}>
            <GlyphSonar
              className='size-full'
              colors={[colors.accent, colors.foreground]}
              backgroundColor={colors.background}
              originX={0.5}
              originY={0.42}
              glyphSize={12}
              interval={4.4}
              intensity={0.55}
              interactive={false}
              clickPing={false}
            />
          </Suspense>
        </div>
      </div>

      <div className='relative grid w-full max-w-2xl gap-6 text-center'>
        <p
          aria-hidden
          className='font-ascii text-muted-foreground mx-auto flex items-center gap-1.5 text-xs'
        >
          <span className='text-landing-accent'>$</span>
          playground --new
          <span className='ascii-caret'>_</span>
        </p>

        <div className='grid gap-2.5'>
          <h2 className='text-[clamp(1.6rem,3vw,2.25rem)] leading-(--leading-heading) font-semibold tracking-(--tracking-display) text-balance'>
            {t('Start a playground chat')}
          </h2>
          <p className='text-muted-foreground mx-auto max-w-lg text-sm leading-6 text-balance'>
            {t(
              'Test a model with a starter prompt, or write your own request below.'
            )}
          </p>
        </div>

        <div className='grid gap-2 sm:grid-cols-2'>
          {starterPrompts.map(({ icon: Icon, text }, index) => {
            const prompt = t(text)

            return (
              <Button
                variant='outline'
                className='group bg-background/80 hover:border-foreground/25 h-auto min-h-12 justify-start gap-3 rounded-2xl px-4 py-3 text-left font-normal whitespace-normal backdrop-blur transition-[border-color,transform] duration-200 hover:-translate-y-0.5'
                key={text}
                onClick={() => onSelectPrompt(prompt)}
              >
                <span className='font-ascii text-muted-foreground text-xs tabular-nums'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Icon
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden
                />
                <span className='min-w-0 flex-1 font-medium'>{prompt}</span>
                <ArrowRight
                  className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5'
                  aria-hidden
                />
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
