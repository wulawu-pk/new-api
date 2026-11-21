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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Pane } from '@/components/terminal/pane'
import {
  TERM_BUTTON,
  TERM_BUTTON_PRIMARY,
  TERM_INPUT,
} from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRedemption } from '@/features/wallet/hooks/use-redemption'

type RedeemPaneProps = {
  /** Face value (¥) → shop link for buying a code. */
  amountLinks?: Record<number, string>
  initialCode?: string
  onRedeemed: () => void
}

/**
 * Redeem a card code bought in the shop (WeChat / Alipay). The shared
 * `useRedemption` hook extracts the 32-hex code from whatever was pasted
 * (text, link, spaces) and reports the result.
 */
export function RedeemPane(props: RedeemPaneProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState(props.initialCode ?? '')
  const { redeeming, redeemCode } = useRedemption()
  const links = Object.entries(props.amountLinks ?? {})
    .map(([value, url]) => ({ value: Number(value), url }))
    .filter((link) => Number.isFinite(link.value) && link.url)
    .sort((a, b) => a.value - b.value)

  return (
    <Pane
      hero
      title={
        <>
          <b>{t('Redeem a card code')}</b>
          {'　'}
          {t('WeChat, Alipay')}
        </>
      }
    >
      <form
        noValidate
        className='flex flex-col gap-4 px-5 pt-6 pb-5'
        onSubmit={async (event) => {
          event.preventDefault()
          if (await redeemCode(code)) {
            setCode('')
            props.onRedeemed()
          }
        }}
      >
        <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
          {t(
            'Buy a card code in the shop and paste it here. Pasting the whole message or link works too.'
          )}
        </p>
        <div className='flex flex-col gap-[7px]'>
          <Label
            htmlFor='console-redeem'
            className='text-t-fg2 text-[13px] font-normal'
          >
            {t('Card code')}
          </Label>
          <Input
            id='console-redeem'
            value={code}
            autoComplete='off'
            placeholder={t('32-character code')}
            onChange={(event) => setCode(event.target.value)}
            className={`${TERM_INPUT} font-mono`}
          />
        </div>
        <div className='flex flex-wrap gap-2.5'>
          <Button
            type='submit'
            className={TERM_BUTTON_PRIMARY}
            disabled={redeeming}
          >
            {redeeming ? t('Redeeming…') : t('Redeem code')}
          </Button>
        </div>
        {links.length > 0 && (
          <div className='border-t-faint flex flex-col gap-2 border-t border-dashed pt-3.5'>
            <span className='text-t-dim text-[13px]'>
              {t('Buy a card code (opens the shop)')}
            </span>
            <div className='flex flex-wrap gap-2'>
              {links.map((link) => (
                <Button
                  key={link.value}
                  size='sm'
                  variant='outline'
                  className={`${TERM_BUTTON} font-mono`}
                  render={
                    <a
                      href={link.url}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  }
                >
                  ¥{link.value}
                </Button>
              ))}
            </div>
          </div>
        )}
      </form>
    </Pane>
  )
}
