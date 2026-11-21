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
import { useTranslation } from 'react-i18next'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

import type { UserGroup } from '../../hooks/use-user-groups'
import { groupName, groupNote, ratioLabel } from '../../lib/groups'

type GroupPickerProps = {
  groups: UserGroup[]
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  'aria-labelledby'?: string
}

/**
 * Single-choice group list for the create-key dialog: each option shows the
 * group's short name, its price ratio and one line on what it is for.
 * Composed from `components/ui/radio-group`; the combobox in
 * `components/model-group-selector` hides the notes the user needs to pick.
 */
export function GroupPicker(props: GroupPickerProps) {
  const { t } = useTranslation()
  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => props.onChange(String(value))}
      aria-labelledby={props['aria-labelledby']}
      aria-invalid={props.invalid || undefined}
      className={cn(
        'border-t-faint gap-0 border',
        props.invalid && 'border-t-bad'
      )}
    >
      {props.groups.map((group) => {
        const id = `group-${group.key}`
        const checked = props.value === group.key
        return (
          <label
            key={group.key}
            htmlFor={id}
            className={cn(
              'border-t-line grid cursor-pointer grid-cols-[18px_1fr_auto] items-baseline gap-x-2.5 px-3 py-2.5 text-sm [&+&]:border-t',
              checked && 'bg-t-bg3'
            )}
          >
            <RadioGroupItem
              id={id}
              value={group.key}
              className='data-checked:border-t-accent data-checked:bg-t-accent translate-y-[3px]'
            />
            <span>{groupName(group.key, t, group.desc)}</span>
            <em className='text-t-dim font-mono text-[12.5px] not-italic'>
              {ratioLabel(group.key, group.ratio)}
            </em>
            <small className='text-t-dim col-[2/4] -mt-0.5 text-[12.5px] leading-[1.6]'>
              {groupNote(group.key, t, group.desc)}
            </small>
          </label>
        )
      })}
    </RadioGroup>
  )
}
