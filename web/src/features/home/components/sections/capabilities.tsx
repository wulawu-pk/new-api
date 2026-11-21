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

import { ChannelHubCard } from '../capabilities/channel-hub-card'
import { KeyLimitsCard } from '../capabilities/key-limits-card'
import { ModelRaceCard } from '../capabilities/model-race-card'

export function Capabilities() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='home-capabilities-heading'
      className='relative z-10 px-4 py-24 sm:px-6 lg:py-28'
    >
      <div className='mx-auto w-full max-w-7xl'>
        <div className='max-w-3xl'>
          <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
            [ {t('API Proxy Center')} ]
          </p>
          <h2
            id='home-capabilities-heading'
            className='mt-4 text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl'
          >
            {t('Everything between your app and the model')}
          </h2>
        </div>

        <div className='mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-3'>
          <ModelRaceCard />
          <ChannelHubCard />
          <KeyLimitsCard />
        </div>
      </div>
    </section>
  )
}
