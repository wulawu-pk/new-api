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
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EASE } from '../../constants'
import { BentoCard } from './bento-card'

const SIZE = 240
const C = SIZE / 2
const R = 84
const START = -210
const SWEEP = 240
const STEP_MS = 3600
const ARC_LENGTH = (Math.PI * R * SWEEP) / 180

function polar(deg: number, radius: number) {
  const angle = (deg * Math.PI) / 180
  return {
    x: Math.round((C + Math.cos(angle) * radius) * 100) / 100,
    y: Math.round((C + Math.sin(angle) * radius) * 100) / 100,
  }
}

const TRACK = (() => {
  const a = polar(START, R)
  const b = polar(START + SWEEP, R)
  return `M${a.x} ${a.y} A${R} ${R} 0 1 1 ${b.x} ${b.y}`
})()

export function KeyLimitsCard() {
  const { t } = useTranslation()
  const reduce = !!useReducedMotion()
  const gradientId = useId()
  const [step, setStep] = useState(0)

  // Illustrative readings for one key: what an owner watches, not live data.
  const readings = [
    { label: t('Quota used'), value: '42%', needle: 0.42 },
    { label: 'RPM', value: '45/60', needle: 0.75 },
    { label: t('Days to expiry'), value: '12', needle: 0.4 },
  ]
  const current = readings[step % readings.length]

  useEffect(() => {
    if (reduce) return
    const id = window.setInterval(() => setStep((s) => s + 1), STEP_MS)
    return () => window.clearInterval(id)
  }, [reduce])

  const angle = useMotionValue(START + SWEEP * current.needle)
  const smooth = useSpring(angle, { stiffness: 60, damping: 12 })
  useEffect(() => {
    angle.set(START + SWEEP * current.needle)
  }, [angle, current.needle])
  const source = reduce ? angle : smooth
  const tipX = useTransform(
    source,
    (d) => C + Math.cos((d * Math.PI) / 180) * (R - 22)
  )
  const tipY = useTransform(
    source,
    (d) => C + Math.sin((d * Math.PI) / 180) * (R - 22)
  )

  return (
    <BentoCard
      title={t('Limits on every key')}
      body={t(
        'Give each key its own quota, expiry, model allowlist and IP range, then watch usage as it happens.'
      )}
    >
      <div
        aria-hidden
        className='absolute inset-0 flex items-center justify-center p-4'
      >
        <div
          className='relative shrink-0 scale-[0.9] sm:scale-100'
          style={{ width: SIZE, height: SIZE }}
        >
          <div className='border-border absolute inset-[8px] rounded-full border border-dashed motion-safe:animate-[spin_60s_linear_infinite]' />
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className='text-foreground absolute inset-0 size-full overflow-visible'
          >
            <defs>
              <radialGradient
                id={gradientId}
                gradientUnits='userSpaceOnUse'
                cx={C}
                cy={C}
                r={R - 22}
              >
                <stop offset='0.18' stopColor='currentColor' stopOpacity={0} />
                <stop offset='0.6' stopColor='currentColor' />
              </radialGradient>
            </defs>
            <circle
              cx={C}
              cy={C}
              r={R + 18}
              className='fill-background stroke-border'
              strokeWidth={1.25}
            />
            {Array.from({ length: 25 }, (_, i) => {
              const deg = START + (SWEEP / 24) * i
              const major = i % 6 === 0
              const a = polar(deg, R - (major ? 14 : 9))
              const b = polar(deg, R - 4)
              return (
                <line
                  key={deg}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke='currentColor'
                  strokeWidth={major ? 1.5 : 1}
                  className={major ? 'text-muted-foreground' : 'text-border'}
                />
              )
            })}
            <path
              d={TRACK}
              fill='none'
              stroke='currentColor'
              strokeWidth={6}
              strokeLinecap='round'
              className='text-muted'
            />
            <motion.path
              d={TRACK}
              fill='none'
              stroke='currentColor'
              strokeWidth={6}
              strokeLinecap='round'
              strokeDasharray={ARC_LENGTH}
              initial={false}
              animate={{ strokeDashoffset: ARC_LENGTH * (1 - current.needle) }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 60, damping: 14 }
              }
              className='text-landing-accent'
            />
            <motion.line
              x1={C}
              y1={C}
              x2={tipX}
              y2={tipY}
              stroke={`url(#${gradientId})`}
              strokeWidth={2.5}
              strokeLinecap='round'
            />
          </svg>

          <div className='absolute inset-x-0 bottom-[16%] flex flex-col items-center'>
            <motion.span
              key={current.label}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className='font-ascii text-2xl font-semibold tracking-tight tabular-nums'
            >
              {current.value}
            </motion.span>
            <span className='text-muted-foreground mt-0.5 text-[10px] font-medium tracking-[0.18em] uppercase'>
              {current.label}
            </span>
          </div>

          <span className='border-border bg-background font-ascii absolute top-[8%] -left-6 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap shadow-xs'>
            models: gpt-*, claude-*
          </span>
          <span className='border-border bg-background font-ascii absolute top-[30%] -right-6 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap shadow-xs'>
            ip: 10.0.0.0/8
          </span>
        </div>
      </div>
    </BentoCard>
  )
}
