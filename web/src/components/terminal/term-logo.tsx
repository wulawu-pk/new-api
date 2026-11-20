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

/**
 * Brand mark: "peroai" followed by a blinking pink block caret. It is a
 * plain link to `/` so the static landing page loads (not the SPA route).
 */
export function TermLogo(props: { className?: string; href?: string }) {
  return (
    <a
      href={props.href ?? '/'}
      aria-label='peroai'
      className={cn(
        'text-t-fg inline-flex items-center font-sans text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap',
        props.className
      )}
    >
      peroai
      <span className='t-caret' aria-hidden='true' />
    </a>
  )
}
