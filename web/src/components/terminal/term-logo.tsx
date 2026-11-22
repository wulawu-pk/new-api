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
import { cn } from '@/lib/utils'

/*
 * peroai horizontal logo, dark-background version, from the logo kit in
 * refactor/ui-v4 (`web/public/logo/peroai-switch-p-horizontal-dark.svg`):
 * the P mark with its green dot, then the lettering. Inlined so the console
 * ships it with the bundle and needs no extra request.
 */
const MARK_PATHS = [
  {
    d: 'M76 41H180A51 51 0 0 1 231 92V124A51 51 0 0 1 180 175H25V92A51 51 0 0 1 76 41ZM76 63H180A29 29 0 0 1 209 92V124A29 29 0 0 1 180 153H47V92A29 29 0 0 1 76 63Z',
    evenOdd: true,
  },
  {
    d: 'M36 81H36A11 11 0 0 1 47 92V200A11 11 0 0 1 36 211H36A11 11 0 0 1 25 200V92A11 11 0 0 1 36 81Z',
  },
]
const MARK_DOT = 'M141 108A27 27 0 1 0 195 108A27 27 0 1 0 141 108Z'
const LETTER_PATHS = [
  {
    d: 'M0 133A54 54 0 1 0 108 133A54 54 0 1 0 0 133ZM18 133A36 36 0 1 0 90 133A36 36 0 1 0 18 133Z',
    evenOdd: true,
  },
  {
    d: 'M9 79H9A9 9 0 0 1 18 88V218A9 9 0 0 1 9 227H9A9 9 0 0 1 0 218V88A9 9 0 0 1 9 79Z',
  },
  {
    d: 'M137 124H227A9 9 0 0 1 236 133V133A9 9 0 0 1 227 142H137A9 9 0 0 1 128 133V133A9 9 0 0 1 137 124Z',
  },
  {
    d: 'M220.18 171.18A54 54 0 1 1 236 133A9 9 0 0 1 218 133A36 36 0 1 0 207.46 158.46A9 9 0 0 1 220.18 171.18Z',
  },
  { d: 'M218 133A9 9 0 1 0 236 133A9 9 0 1 0 218 133Z' },
  {
    d: 'M265 79H265A9 9 0 0 1 274 88V178A9 9 0 0 1 265 187H265A9 9 0 0 1 256 178V88A9 9 0 0 1 265 79Z',
  },
  {
    d: 'M256 133A54 54 0 0 1 310 79A9 9 0 0 1 310 97A36 36 0 0 0 274 133A9 9 0 0 1 256 133Z',
  },
  {
    d: 'M333 133A54 54 0 1 0 441 133A54 54 0 1 0 333 133ZM351 133A36 36 0 1 0 423 133A36 36 0 1 0 351 133Z',
    evenOdd: true,
  },
  {
    d: 'M461 133A54 54 0 1 0 569 133A54 54 0 1 0 461 133ZM479 133A36 36 0 1 0 551 133A36 36 0 1 0 479 133Z',
    evenOdd: true,
  },
  {
    d: 'M560 79H560A9 9 0 0 1 569 88V178A9 9 0 0 1 560 187H560A9 9 0 0 1 551 178V88A9 9 0 0 1 560 79Z',
  },
  {
    d: 'M603 79H603A9 9 0 0 1 612 88V178A9 9 0 0 1 603 187H603A9 9 0 0 1 594 178V88A9 9 0 0 1 603 79Z',
  },
  { d: 'M592 58A11 11 0 1 0 614 58A11 11 0 1 0 592 58Z' },
]

/**
 * Brand mark: the peroai horizontal logo. It is a plain link to `/` so the
 * static landing page loads (not the SPA route).
 */
export function TermLogo(props: { className?: string; href?: string }) {
  return (
    <a
      href={props.href ?? '/'}
      aria-label='peroai'
      className={cn('inline-flex flex-none items-center', props.className)}
    >
      <svg
        viewBox='0 47 894.12 180'
        aria-hidden='true'
        focusable='false'
        className='block h-[22px] w-auto'
      >
        <g transform='translate(-26.47 3.59) scale(1.06)'>
          {MARK_PATHS.map((path) => (
            <path
              key={path.d}
              fill='#FFFFFF'
              fillRule={path.evenOdd ? 'evenodd' : undefined}
              d={path.d}
            />
          ))}
          <path fill='#1EE8A6' d={MARK_DOT} />
        </g>
        <g transform='translate(282.12 0)'>
          {LETTER_PATHS.map((path) => (
            <path
              key={path.d}
              fill='#FFFFFF'
              fillRule={path.evenOdd ? 'evenodd' : undefined}
              d={path.d}
            />
          ))}
        </g>
      </svg>
    </a>
  )
}
