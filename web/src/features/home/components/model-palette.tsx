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
import { useNavigate } from '@tanstack/react-router'
import { KeyRound, Search } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { EASE } from '../constants'
import type {
  ShowcaseModel,
  ShowcaseVendor,
} from '../hooks/use-showcase-models'

const RESULT_LIMIT = 5
const TYPE_MS = 70
const HOLD_MS = 1700

function Key(props: { children: React.ReactNode }) {
  return (
    <kbd className='border-border bg-background text-muted-foreground font-ascii inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[11px] shadow-xs'>
      {props.children}
    </kbd>
  )
}

interface ModelPaletteProps {
  models: ShowcaseModel[]
  vendors: ShowcaseVendor[]
  isLive: boolean
}

/**
 * Command-palette search over the instance's model catalog. While idle it
 * types example queries on its own; focusing the field hands control to the
 * visitor, and Enter opens the model's page.
 */
export function ModelPalette(props: ModelPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const listId = useId()
  const [typed, setTyped] = useState('')
  const [touched, setTouched] = useState(false)
  const [scope, setScope] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  // One example query per leading vendor: the visible pitch is "any model".
  const demoQueries = useMemo(() => {
    const seen = new Set<string>()
    const queries: string[] = []
    for (const model of props.models) {
      if (seen.has(model.vendor)) continue
      seen.add(model.vendor)
      queries.push(model.name)
      if (queries.length === 5) break
    }
    return queries
  }, [props.models])

  useEffect(() => {
    if (touched || demoQueries.length === 0) return
    if (reduce) {
      setTyped(demoQueries[0])
      return
    }
    let query = 0
    let length = 0
    let deleting = false
    let timer = 0
    const step = () => {
      const target = demoQueries[query]
      if (!deleting && length < target.length) {
        length += 1
        timer = window.setTimeout(step, TYPE_MS)
      } else if (!deleting) {
        deleting = true
        timer = window.setTimeout(step, HOLD_MS)
        return
      } else if (length > 0) {
        length -= 1
        timer = window.setTimeout(step, TYPE_MS / 2)
      } else {
        deleting = false
        query = (query + 1) % demoQueries.length
        timer = window.setTimeout(step, 320)
      }
      setTyped(target.slice(0, length))
    }
    timer = window.setTimeout(step, 600)
    return () => window.clearTimeout(timer)
  }, [demoQueries, reduce, touched])

  const results = useMemo(() => {
    const needle = typed.trim().toLowerCase()
    return props.models
      .filter((model) => !scope || model.vendor === scope)
      .filter((model) => !needle || model.name.toLowerCase().includes(needle))
      .slice(0, RESULT_LIMIT)
  }, [props.models, scope, typed])

  const selected = Math.min(active, Math.max(results.length - 1, 0))
  const scopes = [
    { name: null, label: t('All'), count: props.models.length },
    ...props.vendors.slice(0, 3).map((vendor) => ({
      name: vendor.name,
      label: vendor.name,
      count: vendor.count,
    })),
  ]

  const open = (model: ShowcaseModel) => {
    if (props.isLive) {
      navigate({ to: '/pricing/$modelId', params: { modelId: model.name } })
      return
    }
    navigate({ to: '/pricing', search: { search: model.name } })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((selected + 1) % Math.max(results.length, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((selected - 1 + results.length) % Math.max(results.length, 1))
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault()
      open(results[selected])
    } else if (event.key === 'Escape') {
      setTyped('')
      setActive(0)
    }
  }

  return (
    <div className='border-border bg-background/90 w-full max-w-2xl overflow-hidden rounded-3xl border text-left shadow-[0_40px_80px_-40px_rgba(0,0,0,0.35)] backdrop-blur-xl'>
      <div className='border-border flex items-center gap-3 border-b px-5 py-4'>
        <Search className='text-muted-foreground size-5 shrink-0' aria-hidden />
        <label htmlFor={`${listId}-input`} className='sr-only'>
          {t('Search models')}
        </label>
        <input
          id={`${listId}-input`}
          role='combobox'
          aria-expanded={results.length > 0}
          aria-controls={`${listId}-list`}
          aria-activedescendant={
            results[selected] ? `${listId}-opt-${selected}` : undefined
          }
          aria-autocomplete='list'
          autoComplete='off'
          spellCheck={false}
          value={typed}
          placeholder={t('Search any model…')}
          onFocus={() => {
            if (touched) return
            setTouched(true)
            setTyped('')
          }}
          onChange={(event) => {
            setTouched(true)
            setTyped(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className='font-ascii placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-sm outline-none sm:text-base'
        />
        {!touched && !reduce && (
          <span
            aria-hidden
            className='bg-landing-accent ascii-caret -ml-2 h-5 w-[2px] shrink-0'
          />
        )}
        <Key>esc</Key>
      </div>

      <div className='flex items-center gap-1 overflow-x-auto px-3 pt-3'>
        {scopes.map((item) => {
          const isActive = scope === item.name
          return (
            <button
              key={item.label}
              type='button'
              aria-pressed={isActive}
              onClick={() => {
                setScope(item.name)
                setActive(0)
              }}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors duration-200',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
              <span className='font-ascii text-muted-foreground/70 tabular-nums'>
                {item.count}
              </span>
            </button>
          )
        })}
      </div>

      <p className='font-ascii text-muted-foreground px-5 pt-4 pb-1 text-[11px] tracking-[0.18em] uppercase'>
        {t('Models')}
      </p>
      <ul
        id={`${listId}-list`}
        role='listbox'
        aria-label={t('Models')}
        className='flex min-h-[17.5rem] flex-col gap-0.5 px-2 pb-2'
      >
        {results.length === 0 && (
          <li className='text-muted-foreground px-3 py-6 text-center text-sm'>
            {t('No models match "{{query}}"', { query: typed })}
          </li>
        )}
        {results.map((model, index) => {
          const isActive = index === selected
          return (
            <li
              key={model.name}
              id={`${listId}-opt-${index}`}
              role='option'
              aria-selected={isActive}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(model)}
              className={cn(
                'relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5',
                isActive && 'bg-muted/70'
              )}
            >
              {isActive && !reduce && (
                <motion.span
                  aria-hidden
                  className='via-foreground/[0.05] pointer-events-none absolute inset-0 bg-linear-to-r from-transparent to-transparent'
                  initial={{ x: '-140%' }}
                  animate={{ x: '140%' }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    repeatDelay: 2.6,
                    ease: EASE,
                  }}
                />
              )}
              <span className='border-border bg-background relative flex size-9 shrink-0 items-center justify-center rounded-lg border'>
                {getLobeIcon(model.icon, 18)}
              </span>
              <span className='font-ascii relative min-w-0 flex-1 truncate text-sm font-medium'>
                {model.name}
              </span>
              <span className='font-ascii text-muted-foreground relative hidden shrink-0 text-xs sm:block'>
                {model.endpoints.slice(0, 2).join(' · ')}
              </span>
              {isActive && (
                <span className='text-muted-foreground relative flex shrink-0 items-center gap-1.5 text-xs'>
                  <span className='hidden sm:inline'>{t('Open')}</span>
                  <Key>↵</Key>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className='border-border flex items-center justify-between gap-3 border-t px-5 py-3'>
        <span className='font-ascii text-muted-foreground flex min-w-0 items-center gap-2 text-xs'>
          <KeyRound
            className='text-landing-accent size-3.5 shrink-0'
            aria-hidden
          />
          <span className='truncate'>
            sk-••••••••{' '}
            <span className='text-foreground'>
              → {t('{{count}} models', { count: props.models.length })}
            </span>
          </span>
        </span>
        <span className='text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex'>
          <Key>↑</Key>
          <Key>↓</Key>
          <Key>↵</Key>
        </span>
      </div>
    </div>
  )
}
