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

import { cn } from '@/lib/utils'

type PaneProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  /** Title sitting on the top border. `<b>` inside renders brighter. */
  title?: ReactNode
  /** The pane the user is working in gets a brighter border. */
  active?: boolean
  /**
   * The main pane of a page (one at most): an accent light from the top
   * right, faint code behind it and a light running along the top edge,
   * after the cards of the refactor/ui-v4 dashboard. Other panes stay plain.
   */
  hero?: boolean
}

/** Faint code behind a hero pane (decoration, hidden from assistive tech). */
const HERO_CODE = [
  'export ANTHROPIC_BASE_URL=https://api.peroai.cc',
  'claude --model claude-sonnet-5-5',
  '',
  'curl https://api.peroai.cc/v1/chat/completions',
  '  -H "Authorization: Bearer sk-••••"',
].join('\n')

/**
 * Terminal pane: a 1px bordered box whose title sits on the top edge.
 *
 * `components/ui/card` is not reused here because the card clips overflow
 * (`overflow-hidden`) and the title must overhang the border, and its
 * padding/gap rhythm does not match the spec; panes also double as form
 * and table containers, so the element stays a plain `<section>`.
 */
export function Pane(props: PaneProps) {
  const { title, active, hero, className, children, ...rest } = props
  return (
    <section
      data-slot='pane'
      data-active={active ? 'true' : undefined}
      className={cn('t-pane', hero && 't-hero', className)}
      {...rest}
    >
      {title != null && <span className='t-pane-title'>{title}</span>}
      {children}
      {hero && (
        <>
          <pre aria-hidden='true' className='t-hero-code'>
            {HERO_CODE}
          </pre>
          <span aria-hidden='true' className='t-hero-sweep' />
        </>
      )}
    </section>
  )
}
