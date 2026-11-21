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

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { PROVIDER_ROWS } from '../../constants'

const ROW_DURATIONS = [52, 40, 58]

export function Providers() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='home-providers-heading'
      className='relative z-10 px-4 py-20 sm:px-6'
    >
      <div className='mx-auto w-full max-w-7xl'>
        <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end'>
          <h2
            id='home-providers-heading'
            className='max-w-xl text-2xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-3xl'
          >
            {t('Every major provider, behind one endpoint')}
          </h2>
          <p className='font-ascii text-muted-foreground text-xs'>
            {t('40+ upstream channel types')}
          </p>
        </div>

        <div className='border-border mt-10 flex flex-col gap-3 overflow-hidden rounded-3xl border py-8'>
          {PROVIDER_ROWS.map((row, index) => {
            const focal = index === 1
            return (
              <div
                key={row[0].name}
                className='overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]'
              >
                <ul
                  data-reverse={focal ? '' : undefined}
                  style={
                    {
                      '--marquee-duration': `${ROW_DURATIONS[index]}s`,
                    } as React.CSSProperties
                  }
                  className='landing-marquee flex w-max items-center gap-6'
                >
                  {(['first', 'second'] as const).flatMap((copy) =>
                    row.map((provider) => (
                      <li
                        key={`${copy}-${provider.name}`}
                        aria-hidden={copy === 'second' || undefined}
                        className={cn(
                          'border-border bg-background flex shrink-0 items-center gap-2.5 rounded-full border whitespace-nowrap transition-colors duration-300',
                          focal
                            ? 'px-5 py-3 text-base font-medium'
                            : 'text-muted-foreground hover:text-foreground px-4 py-2 text-sm'
                        )}
                      >
                        {getLobeIcon(provider.icon, focal ? 22 : 18)}
                        {provider.name}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
