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
import { KeyRound } from 'lucide-react'
import { motion, useReducedMotion, type Transition } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { EASE } from '../../constants'
import { BentoCard } from './bento-card'

// Illustrative routing table an operator could configure.
const CHANNELS = [
  { label: 'OpenAI', icon: 'OpenAI', weight: 40 },
  { label: 'Azure', icon: 'Azure.Color', weight: 30 },
  { label: 'Bedrock', icon: 'Bedrock.Color', weight: 20 },
  { label: 'Vertex', icon: 'VertexAI.Color', weight: 10 },
]

const PATHS = [
  'M50 0 C50 44 200 22 200 64',
  'M150 0 C150 40 200 30 200 64',
  'M250 0 C250 40 200 30 200 64',
  'M350 0 C350 44 200 22 200 64',
]

export function ChannelHubCard() {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered === null ? null : CHANNELS[hovered]

  // Idle: the bar breathes; hovered: it settles at that channel's weight.
  let barAnimate: { scaleX: number | number[] } | undefined = {
    scaleX: [0.08, 0.72, 0.72, 0.08],
  }
  let barTransition: Transition = {
    duration: 4.4,
    times: [0, 0.55, 0.85, 1],
    repeat: Infinity,
    ease: 'easeInOut',
  }
  if (active) {
    barAnimate = { scaleX: active.weight / 40 }
    barTransition = { duration: 0.6, ease: EASE }
  }
  if (reduce) barAnimate = undefined

  return (
    <BentoCard
      title={t('Many channels, one key')}
      body={t(
        'Operators add upstream channels with weights and priorities. Your key and base URL never change.'
      )}
    >
      <div className='absolute inset-0 flex flex-col items-center justify-center px-6 py-5'>
        <div className='grid w-full max-w-[360px] grid-cols-4 gap-1.5'>
          {CHANNELS.map((channel, index) => (
            <div key={channel.label} className='flex justify-center'>
              <button
                type='button'
                aria-label={channel.label}
                aria-pressed={hovered === index}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-full border shadow-xs transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5',
                  hovered === index
                    ? 'border-foreground bg-foreground/5'
                    : 'border-border bg-background'
                )}
              >
                {getLobeIcon(channel.icon, 18)}
              </button>
            </div>
          ))}
        </div>

        <svg
          aria-hidden
          viewBox='0 0 400 64'
          preserveAspectRatio='none'
          className='h-14 w-full max-w-[360px] overflow-visible'
        >
          {PATHS.map((d, index) => (
            <g key={d}>
              <path
                d={d}
                fill='none'
                stroke='currentColor'
                strokeWidth={hovered === index ? 1.75 : 1.25}
                vectorEffect='non-scaling-stroke'
                className={cn(
                  'transition-colors duration-300',
                  hovered === index ? 'text-landing-accent' : 'text-border'
                )}
              />
              {!reduce && hovered === null && (
                <motion.path
                  d={d}
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  strokeLinecap='round'
                  vectorEffect='non-scaling-stroke'
                  pathLength={100}
                  strokeDasharray='10 90'
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: [100, 0] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: 'linear',
                    delay: index * 0.55,
                  }}
                  className='text-landing-accent'
                />
              )}
            </g>
          ))}
        </svg>

        <motion.span
          animate={reduce ? undefined : { scale: hovered === null ? 1 : 1.05 }}
          transition={{ duration: 0.3, ease: EASE }}
          className='bg-foreground text-background font-ascii inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs'
        >
          <KeyRound className='size-3.5' aria-hidden />
          sk-••••••••
        </motion.span>

        <div className='border-border bg-background mt-5 w-full max-w-[300px] rounded-xl border p-3 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.2)]'>
          <div className='flex items-center justify-between gap-3 text-[11px]'>
            <span className='flex items-center gap-2 font-medium'>
              <span className='bg-landing-accent size-1.5 rounded-full' />
              {active
                ? t('Routing to {{channel}}', { channel: active.label })
                : t('Routing across {{count}} channels', {
                    count: CHANNELS.length,
                  })}
            </span>
            <span className='font-ascii text-muted-foreground tabular-nums'>
              {active ? `w=${active.weight}` : 'auto'}
            </span>
          </div>
          <div className='bg-muted mt-2.5 h-1.5 w-full overflow-hidden rounded-full'>
            <motion.div
              initial={{ scaleX: reduce ? 0.72 : 0.08 }}
              animate={barAnimate}
              transition={barTransition}
              className='bg-landing-accent h-full w-full origin-left rounded-full'
            />
          </div>
        </div>
      </div>
    </BentoCard>
  )
}
