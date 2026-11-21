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

interface BentoCardProps {
  title: string
  body: string
  children: ReactNode
}

/** Visual on top, title and one sentence below: the landing bento cell. */
export function BentoCard(props: BentoCardProps) {
  return (
    <article className='border-border bg-background flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border transition-transform duration-300 hover:-translate-y-0.5'>
      <div className='relative min-h-[280px] flex-1 overflow-hidden'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_72%)] [background-size:16px_16px]'
        />
        {props.children}
      </div>
      <div className='px-6 pt-2 pb-6'>
        <h3 className='text-base font-semibold tracking-tight sm:text-lg'>
          {props.title}
        </h3>
        <p className='text-muted-foreground mt-1.5 text-sm leading-relaxed text-pretty'>
          {props.body}
        </p>
      </div>
    </article>
  )
}
