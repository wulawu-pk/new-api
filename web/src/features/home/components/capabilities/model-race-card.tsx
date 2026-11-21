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
import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { EASE } from '../../constants'
import { BentoCard } from './bento-card'

const PROMPT = 'Summarize this changelog in one line.'
const HOLD_MS = 3400

// Illustrative answers: the card shows the request shape, not a benchmark.
const RACERS = [
  {
    model: 'claude-sonnet-4-5',
    answer:
      'Adds streaming retries, fixes token counting for images and speeds up model listing.',
    ms: 1900,
  },
  {
    model: 'gpt-4.1-mini',
    answer: 'Streaming retries, image token fix, faster model list.',
    ms: 1100,
  },
].map((racer) => ({
  ...racer,
  words: racer.answer.split(' ').map((text, position) => ({ text, position })),
}))

export function ModelRaceCard() {
  const { t } = useTranslation()
  const reduce = !!useReducedMotion()
  const [inView, setInView] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const clock = useRef(0)

  const shown = reduce ? Infinity : elapsed
  const allDone = RACERS.every((racer) => shown >= racer.ms)

  useEffect(() => {
    if (!inView || reduce) return
    if (allDone) {
      const timer = window.setTimeout(() => {
        clock.current = 0
        setElapsed(0)
      }, HOLD_MS)
      return () => window.clearTimeout(timer)
    }
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      clock.current += now - last
      last = now
      setElapsed(clock.current)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [inView, reduce, allDone])

  return (
    <BentoCard
      title={t('Switch models by name')}
      body={t(
        'Send the same request to two models and keep the better answer. Only the model string changes.'
      )}
    >
      <motion.div
        aria-hidden
        onViewportEnter={() => setInView(true)}
        viewport={{ amount: 0.3 }}
        className='border-border bg-background absolute inset-x-4 top-4 bottom-4 flex flex-col overflow-hidden rounded-2xl border shadow-[0_12px_32px_-16px_rgba(0,0,0,0.2)]'
      >
        <div className='border-border border-b px-4 py-3'>
          <p className='font-ascii text-muted-foreground text-[10px] tracking-wider uppercase'>
            POST /v1/chat/completions
          </p>
          <p className='mt-1 text-xs'>{PROMPT}</p>
        </div>
        <div className='bg-border grid flex-1 grid-cols-2 gap-px'>
          {RACERS.map((racer) => {
            const progress = Math.min(1, shown / racer.ms)
            const count = Math.floor(progress * racer.words.length)
            const done = shown >= racer.ms
            return (
              <div
                key={racer.model}
                className='bg-background flex flex-col p-3'
              >
                <span className='font-ascii text-landing-accent truncate text-[10px]'>
                  &quot;{racer.model}&quot;
                </span>
                <p className='mt-2 flex-1 text-[11px] leading-relaxed'>
                  {racer.words.map((word) => (
                    <span
                      key={word.position}
                      className='transition-opacity duration-300'
                      style={{ opacity: word.position < count ? 1 : 0 }}
                    >
                      {word.text}{' '}
                    </span>
                  ))}
                </p>
                <div className='mt-3 flex items-center gap-2'>
                  <span className='bg-muted relative h-0.5 flex-1 overflow-hidden rounded-full'>
                    <span
                      className='bg-foreground absolute inset-y-0 left-0 rounded-full'
                      style={{ width: `${progress * 100}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'font-ascii text-muted-foreground inline-flex w-11 items-center justify-end gap-1 text-[10px] tabular-nums',
                      done && 'text-foreground'
                    )}
                  >
                    {done && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: EASE }}
                      >
                        <Check className='text-landing-accent size-2.5' />
                      </motion.span>
                    )}
                    {(Math.min(shown, racer.ms) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </BentoCard>
  )
}
