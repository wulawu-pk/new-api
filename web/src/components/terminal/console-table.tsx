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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/*
 * Terminal-styled table built from `components/ui/table`: dim 12.5px
 * headers over a faint rule, 14px cells, monospace and right-aligned
 * numeric columns, `line` row dividers. `stateMode` drops the header and
 * min-width when the body only holds a loading/empty/error message, so the
 * message is not clipped on narrow screens.
 */

export function ConsoleTable(
  props: React.ComponentProps<'table'> & {
    minWidth?: number
    stateMode?: boolean
  }
) {
  const { minWidth, stateMode, className, style, ...rest } = props
  return (
    <Table
      className={cn(
        '[font-family:var(--font-ui-sans)] [&_td]:font-normal [&_th]:text-[12.5px]',
        stateMode && '[&_thead]:hidden',
        className
      )}
      style={{ minWidth: stateMode ? undefined : minWidth, ...style }}
      {...rest}
    />
  )
}

export function ConsoleTableHeader(props: React.ComponentProps<'thead'>) {
  return <TableHeader {...props} />
}

export function ConsoleTableBody(props: React.ComponentProps<'tbody'>) {
  const { className, ...rest } = props
  return <TableBody className={cn('[&>tr]:h-auto', className)} {...rest} />
}

export function ConsoleTableRow(props: React.ComponentProps<'tr'>) {
  const { className, ...rest } = props
  return (
    <TableRow
      className={cn('border-t-line hover:bg-t-bg3', className)}
      {...rest}
    />
  )
}

type CellKind = 'text' | 'mono' | 'num'

export function ConsoleTh(
  props: React.ComponentProps<'th'> & { kind?: CellKind }
) {
  const { kind, className, ...rest } = props
  return (
    <TableHead
      className={cn(
        'text-t-dim border-t-faint h-auto border-b px-3.5 py-2.5 font-medium',
        kind === 'num' && 'text-right',
        className
      )}
      {...rest}
    />
  )
}

export function ConsoleTd(
  props: React.ComponentProps<'td'> & { kind?: CellKind }
) {
  const { kind, className, ...rest } = props
  return (
    <TableCell
      className={cn(
        'px-3.5 py-3 text-sm',
        kind === 'mono' && 'font-mono !text-[13.5px]',
        kind === 'num' &&
          'text-right font-mono !text-[13.5px] [font-variant-numeric:tabular-nums]',
        className
      )}
      {...rest}
    />
  )
}
