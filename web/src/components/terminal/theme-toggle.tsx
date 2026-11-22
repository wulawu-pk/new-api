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
import { Moon, Sun } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

import { prefersReducedMotion } from './lib'

/** Fired on `document` after the theme is switched (detail: 'light' | 'dark'). */
export const THEME_EVENT = 'peroai:theme'
/** How long colours ease over after a switch (html.theme-anim, terminal.css). */
const THEME_ANIM_MS = 350

let themeAnimTimer = 0

/**
 * Round sun / moon button that flips between the dark and light theme: a
 * sun while dark (press for light), a moon while light. The choice is saved
 * as `dark` / `light` under the theme key shared with the beta landing page
 * and docs. `theme-switch.tsx` (admin header) is a three-way menu with
 * "system"; the console needs a single press and the icon swap.
 */
export function ThemeToggle(props: { className?: string }) {
  const { t } = useTranslation()
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const dark = theme.resolvedTheme === 'dark'
  const label = dark ? t('Switch to light theme') : t('Switch to dark theme')

  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    const root = document.documentElement
    if (!prefersReducedMotion()) {
      root.classList.add('theme-anim')
      window.clearTimeout(themeAnimTimer)
      themeAnimTimer = window.setTimeout(
        () => root.classList.remove('theme-anim'),
        THEME_ANIM_MS
      )
    }
    theme.setTheme(next)
    document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }))
  }

  const Icon = dark ? Sun : Moon
  const turn = reduceMotion ? 0 : 90

  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        'text-t-fg2 hover:text-t-fg hover:bg-t-ink/6 relative flex size-9 flex-none items-center justify-center overflow-hidden rounded-full transition-colors duration-200',
        'focus-visible:ring-(--t-accent)/60 focus-visible:ring-2 focus-visible:outline-none',
        props.className
      )}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={dark ? 'sun' : 'moon'}
          aria-hidden='true'
          className='absolute inset-0 flex items-center justify-center'
          initial={{ opacity: 0, rotate: -turn }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: turn }}
          transition={{
            duration: reduceMotion ? 0 : 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <Icon className='size-[1.1rem]' strokeWidth={1.75} />
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
