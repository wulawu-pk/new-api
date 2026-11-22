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
import type { ReactNode } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type TermSelectOption = { value: string; label: ReactNode }

type TermSelectProps = {
  /** Lets a `<Label htmlFor>` name the trigger. */
  id?: string
  value: string
  options: TermSelectOption[]
  onValueChange: (value: string) => void
  'aria-label'?: string
  /** Passed on by `ui/form`'s `FormControl` along with `id`. */
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  disabled?: boolean
  /** Extra classes for the trigger (width, padding). */
  className?: string
}

/**
 * The console's dropdown (spec: `.in` as a picker): the shared `ui/select`
 * dressed like the terminal inputs, opening a dark list under the field
 * instead of the system menu, whose light-blue rows ignore the theme. The
 * picked row carries the accent tick; ↑/↓, Enter and typing a letter work as
 * in any listbox.
 */
export function TermSelect(props: TermSelectProps) {
  return (
    <Select
      value={props.value}
      items={props.options}
      disabled={props.disabled}
      onValueChange={(next) => {
        if (typeof next === 'string') props.onValueChange(next)
      }}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        aria-describedby={props['aria-describedby']}
        aria-invalid={props['aria-invalid'] || undefined}
        className={cn(
          'bg-t-bg2 dark:bg-t-bg2 dark:hover:bg-t-bg3 hover:bg-t-bg3 text-t-fg w-full data-[size=default]:h-auto gap-2 rounded-(--t-radius) border-(--t-faint) py-2.5 pr-2.5 pl-3 text-sm',
          'focus-visible:border-(--t-accent) focus-visible:ring-0 data-popup-open:border-(--t-accent)',
          '[&_svg]:text-t-dim data-popup-open:[&_svg]:text-t-fg',
          props.className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        sideOffset={6}
        className='bg-t-bg2 text-t-fg rounded-(--t-radius) p-1 shadow-[var(--t-menu-shadow)] ring-(--t-line)'
      >
        {props.options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className='text-t-fg2 focus:text-t-fg not-data-[variant=destructive]:focus:**:text-t-fg data-[selected]:text-t-fg data-[selected]:[&_svg]:text-t-accent! focus:bg-t-ink/[0.06] rounded-[calc(var(--t-radius)-3px)] py-2 pr-8 pl-2.5'
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
