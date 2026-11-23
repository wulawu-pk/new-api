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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SkeletonText } from '@/components/terminal/data-states'
import { Pane } from '@/components/terminal/pane'
import { TERM_BUTTON_PRIMARY, TERM_INPUT } from '@/components/terminal/styles'
import { TermSelect } from '@/components/terminal/term-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PaymentConfirmDialog } from '@/features/wallet/components/dialogs/payment-confirm-dialog'
import {
  QUOTE_FAILED,
  isCoinQuote,
  isQuoteFor,
  usePayment,
} from '@/features/wallet/hooks/use-payment'
import {
  getCryptoUsdCurrency,
  getMinTopupAmount,
} from '@/features/wallet/lib/payment'
import type { PaymentMethod, TopupInfo } from '@/features/wallet/types'
import { useDebounce } from '@/hooks/use-debounce'
import { useSystemConfig } from '@/hooks/use-system-config'
import { formatQuota } from '@/lib/format'

import {
  cryptoCoins,
  networkName,
  networksOf,
  regularMethods,
  splitCryptoMethod,
} from '../lib/pay-methods'

type OnlineTopupPaneProps = {
  topupInfo: TopupInfo
  onPaid: () => void
}

/**
 * Online top-up (USDT / USDC through BEpusdt, or any other epay method).
 * Quotes and orders go through the shared `usePayment` hook and the
 * existing confirm dialog, so the quote-race and rate-change protections of
 * the wallet are unchanged; only the layout is new.
 */
export function OnlineTopupPane(props: OnlineTopupPaneProps) {
  const { t } = useTranslation()
  const methods = useMemo(
    () => regularMethods(props.topupInfo.pay_methods ?? []),
    [props.topupInfo.pay_methods]
  )
  const coins = useMemo(() => cryptoCoins(methods), [methods])
  const cryptoMode =
    Boolean(props.topupInfo.crypto_usd_topup) && coins.length > 0
  const minTopup = getMinTopupAmount(props.topupInfo)

  const [coin, setCoin] = useState(coins[0] ?? '')
  const networks = useMemo(() => networksOf(methods, coin), [methods, coin])
  const [methodType, setMethodType] = useState(
    (cryptoMode ? networks[0]?.type : methods[0]?.type) ?? ''
  )
  const [amountText, setAmountText] = useState(
    String(Math.max(minTopup, cryptoMode ? 5 : minTopup))
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const payment = usePayment()
  const { currency } = useSystemConfig()
  // Same rule as the old wallet: with USD display the rate is 1.
  const usdExchangeRate =
    currency?.quotaDisplayType === 'USD' ? 1 : currency?.usdExchangeRate || 1
  const amount = Number(amountText)
  const amountValid =
    Number.isFinite(amount) && amount >= minTopup && Number.isInteger(amount)
  const debouncedAmount = useDebounce(amount, 400)
  const method: PaymentMethod | undefined = methods.find(
    (m) => m.type === methodType
  )

  useEffect(() => {
    if (!cryptoMode) return
    if (!networks.some((n) => n.type === methodType)) {
      setMethodType(networks[0]?.type ?? '')
    }
  }, [cryptoMode, networks, methodType])

  const { calculatePaymentAmount } = payment
  useEffect(() => {
    if (
      !methodType ||
      !Number.isFinite(debouncedAmount) ||
      debouncedAmount < minTopup
    ) {
      return
    }
    void calculatePaymentAmount(debouncedAmount, methodType)
  }, [debouncedAmount, methodType, minTopup, calculatePaymentAmount])

  const cryptoCurrency = getCryptoUsdCurrency(props.topupInfo, methodType)
  // A coin-priced order may only be confirmed with a complete quote: coins,
  // coin, rate and credited quota. Anything less never reaches the order.
  const quoteReady =
    !payment.calculating &&
    isQuoteFor(payment.quote, amount, methodType) &&
    (!cryptoCurrency || isCoinQuote(payment.quote, cryptoCurrency))

  // Keep the dialog's quote current for exactly this amount and method.
  useEffect(() => {
    if (!confirmOpen || payment.calculating || !methodType) return
    if (
      payment.quote.requestAmount === amount &&
      payment.quote.paymentType === methodType
    ) {
      return
    }
    void calculatePaymentAmount(amount, methodType)
  }, [
    confirmOpen,
    payment.calculating,
    payment.quote.requestAmount,
    payment.quote.paymentType,
    amount,
    methodType,
    calculatePaymentAmount,
  ])

  const openConfirm = async () => {
    if (!amountValid || !method) {
      toast.error(t('The minimum is {{min}}', { min: minTopup }))
      return
    }
    const quote = await calculatePaymentAmount(amount, method.type)
    if (quote && !(quote.amount > 0)) {
      toast.error(quote.error || t('Payment request failed'))
      return
    }
    const coin = getCryptoUsdCurrency(props.topupInfo, method.type)
    if (quote && coin && !isCoinQuote(quote, coin)) {
      toast.error(t(QUOTE_FAILED))
      return
    }
    setConfirmOpen(true)
  }

  const confirm = async () => {
    if (!method || !quoteReady) return
    // The order is placed from the quote the dialog shows, as one snapshot.
    const confirmed = payment.quote
    const ok = await payment.processPayment(amount, method.type, confirmed)
    if (ok) {
      setConfirmOpen(false)
      props.onPaid()
    }
  }

  let credited: React.ReactNode = '—'
  if (amountValid && payment.calculating) credited = <SkeletonText />
  else if (amountValid && quoteReady) {
    credited =
      cryptoMode && payment.quote.creditQuota
        ? formatQuota(payment.quote.creditQuota)
        : `$${amount.toFixed(2)}`
  }

  let rateLine = ''
  if (cryptoMode && quoteReady && payment.quote.rate) {
    rateLine = `1 ${coin} ≈ ¥${payment.quote.rate.toFixed(2)}`
  } else if (!cryptoMode && quoteReady) {
    rateLine = t('Pay {{amount}}', {
      amount: `¥${payment.quote.amount.toFixed(2)}`,
    })
  }

  return (
    <Pane
      title={
        <>
          <b>{cryptoMode ? t('USDT / USDC') : t('Online top-up')}</b>
          {cryptoMode ? `　${t('On-chain')}` : ''}
        </>
      }
    >
      <form
        noValidate
        className='flex flex-col gap-4 px-5 pt-6 pb-5'
        onSubmit={(event) => {
          event.preventDefault()
          void openConfirm()
        }}
      >
        <p className='text-t-dim m-0 text-[13.5px] leading-[1.7]'>
          {cryptoMode
            ? t(
                'Order by number of coins; it is credited after on-chain confirmation. The rate updates every minute.'
              )
            : t('Pay online; the credit arrives after the payment completes.')}
        </p>
        {cryptoMode ? (
          <div className='grid grid-cols-2 gap-3 max-[480px]:grid-cols-1'>
            <div className='flex flex-col gap-[7px]'>
              <Label
                htmlFor='console-coin'
                className='text-t-fg2 text-[13px] font-normal'
              >
                {t('Coin')}
              </Label>
              <TermSelect
                id='console-coin'
                value={coin}
                options={coins.map((c) => ({ value: c, label: c }))}
                onValueChange={setCoin}
              />
            </div>
            <div className='flex flex-col gap-[7px]'>
              <Label
                htmlFor='console-network'
                className='text-t-fg2 text-[13px] font-normal'
              >
                {t('Network')}
              </Label>
              <TermSelect
                id='console-network'
                value={methodType}
                options={networks.map((n) => ({
                  value: n.type,
                  label: networkName(
                    splitCryptoMethod(n.type)?.network ?? n.type
                  ),
                }))}
                onValueChange={setMethodType}
              />
            </div>
          </div>
        ) : (
          <div className='flex flex-col gap-[7px]'>
            <Label
              htmlFor='console-method'
              className='text-t-fg2 text-[13px] font-normal'
            >
              {t('Payment method')}
            </Label>
            <TermSelect
              id='console-method'
              value={methodType}
              options={methods.map((m) => ({ value: m.type, label: m.name }))}
              onValueChange={setMethodType}
            />
          </div>
        )}
        <div className='flex flex-col gap-[7px]'>
          <Label
            htmlFor='console-amount'
            className='text-t-fg2 text-[13px] font-normal'
          >
            {cryptoMode ? t('Amount to pay') : t('Top-up amount')}
          </Label>
          <Input
            id='console-amount'
            inputMode='numeric'
            value={amountText}
            aria-invalid={!amountValid || undefined}
            onChange={(event) => setAmountText(event.target.value.trim())}
            className={`${TERM_INPUT} font-mono`}
          />
          <small
            className={
              amountValid
                ? 'text-t-dim text-[12.5px]'
                : 'text-t-bad text-[12.5px]'
            }
          >
            {cryptoMode
              ? t('At least {{min}}, whole coins', { min: minTopup })
              : t('At least {{min}}', { min: minTopup })}
          </small>
        </div>
        <div className='border-t-faint text-t-dim flex items-baseline justify-between border-t border-dashed pt-3.5 text-[13.5px]'>
          <span>
            {t('Credited')}
            <br />
            <small className='font-mono'>{rateLine}</small>
          </span>
          <b
            className='text-t-fg font-mono text-2xl font-medium'
            aria-live='polite'
          >
            {credited}
          </b>
        </div>
        <Button
          type='submit'
          className={TERM_BUTTON_PRIMARY}
          disabled={!method || payment.processing}
        >
          {t('Go to payment')}
        </Button>
      </form>
      <PaymentConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirm}
        topupAmount={amount}
        paymentAmount={payment.quote.amount}
        paymentMethod={method}
        calculating={payment.calculating}
        quoteReady={quoteReady}
        processing={payment.processing}
        usdExchangeRate={usdExchangeRate}
        cryptoCurrency={cryptoCurrency}
        creditQuota={payment.quote.creditQuota}
      />
    </Pane>
  )
}
