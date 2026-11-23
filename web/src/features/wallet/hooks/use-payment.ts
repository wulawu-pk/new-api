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
import i18next from 'i18next'
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  isApiSuccess,
} from '../api'
import {
  getPaymentErrorTranslation,
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
  openCheckoutUrl,
  submitPaymentForm,
} from '../lib'
import type { AmountRequest, AmountResponse, PaymentResponse } from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

type AmountCalculator = (request: AmountRequest) => Promise<AmountResponse>

export interface PaymentAmountCalculators {
  regular: AmountCalculator
  stripe: AmountCalculator
  waffo: AmountCalculator
  waffoPancake: AmountCalculator
}

const defaultPaymentAmountCalculators: PaymentAmountCalculators = {
  regular: calculateAmount,
  stripe: calculateStripeAmount,
  waffo: calculateWaffoAmount,
  waffoPancake: calculateWaffoPancakeAmount,
}

export async function requestPaymentAmount(
  topupAmount: number,
  paymentType: string,
  calculators: PaymentAmountCalculators = defaultPaymentAmountCalculators
): Promise<number> {
  let calculator = calculators.regular
  if (isStripePayment(paymentType)) {
    calculator = calculators.stripe
  } else if (isWaffoPayment(paymentType)) {
    calculator = calculators.waffo
  } else if (isWaffoPancakePayment(paymentType)) {
    calculator = calculators.waffoPancake
  }

  const response = await calculator({
    amount: topupAmount,
    payment_method: paymentType,
  })
  if (!isApiSuccess(response) || !response.data) {
    return 0
  }

  return Number.parseFloat(response.data)
}

/**
 * peroai: like requestPaymentAmount, but also returns what a coin-priced
 * crypto order credits.
 */
export async function requestPaymentQuote(
  topupAmount: number,
  paymentType: string,
  calculators: PaymentAmountCalculators = defaultPaymentAmountCalculators
): Promise<PaymentQuote> {
  if (
    isStripePayment(paymentType) ||
    isWaffoPayment(paymentType) ||
    isWaffoPancakePayment(paymentType)
  ) {
    return {
      amount: await requestPaymentAmount(topupAmount, paymentType, calculators),
    }
  }
  const response = await calculators.regular({
    amount: topupAmount,
    payment_method: paymentType,
  })
  if (!isApiSuccess(response) || !response.data) {
    return {
      amount: 0,
      error:
        getPaymentErrorTranslation(response) ??
        (typeof response.data === 'string' ? response.data : undefined),
    }
  }
  const quote: PaymentQuote = {
    amount: Number.parseFloat(response.data),
    currency: response.currency,
    rate: response.rate ? Number.parseFloat(response.rate) : undefined,
    creditQuota: response.credit_quota,
  }
  // A coin-priced answer carries currency, rate and credit_quota together;
  // one with only some of them, or a non-numeric one, is not a usable quote.
  const coinPriced =
    response.currency !== undefined ||
    response.rate !== undefined ||
    response.credit_quota !== undefined
  if (coinPriced && !isCoinQuote(quote, quote.currency)) {
    return { amount: 0, error: i18next.t(QUOTE_FAILED) }
  }
  return quote
}

/** Shown when a coin-priced quote is missing fields or has invalid numbers. */
export const QUOTE_FAILED =
  'Could not get a price for this amount. Please try again in a moment.'

/**
 * peroai: a coin-priced crypto quote the customer may confirm: coins to pay,
 * the coin it is priced in, the CNY rate and the quota it credits are all
 * present and valid.
 */
export function isCoinQuote(
  quote: PaymentQuote,
  coin: string | undefined
): boolean {
  return (
    typeof coin === 'string' &&
    coin !== '' &&
    quote.currency === coin &&
    Number.isFinite(quote.amount) &&
    quote.amount > 0 &&
    typeof quote.rate === 'number' &&
    Number.isFinite(quote.rate) &&
    quote.rate > 0 &&
    typeof quote.creditQuota === 'number' &&
    Number.isSafeInteger(quote.creditQuota) &&
    quote.creditQuota > 0
  )
}

export interface PaymentQuote {
  amount: number
  currency?: string
  rate?: number
  creditQuota?: number
  /** Top-up amount the quote was calculated for */
  requestAmount?: number
  /** Payment method the quote was calculated for */
  paymentType?: string
  /** Server message when the quote failed */
  error?: string
}

/** A quote the wallet can confirm: it is for this amount and method. */
export function isQuoteFor(
  quote: PaymentQuote,
  topupAmount: number,
  paymentType: string | undefined
): boolean {
  return (
    quote.amount > 0 &&
    Number.isFinite(quote.amount) &&
    quote.requestAmount === topupAmount &&
    quote.paymentType === paymentType
  )
}

function quoteFromPaymentResponse(
  response: PaymentResponse,
  topupAmount: number,
  paymentType: string
): PaymentQuote {
  return {
    amount: Math.floor(topupAmount),
    currency: response.currency,
    rate: response.rate ? Number.parseFloat(response.rate) : undefined,
    creditQuota: response.credit_quota,
    requestAmount: topupAmount,
    paymentType,
  }
}

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [quote, setQuote] = useState<PaymentQuote>({ amount: 0 })
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)
  // Only the latest quote request may update state: responses can arrive
  // out of order, and an old one must not overwrite what the dialog shows.
  const quoteRequestId = useRef(0)

  // Calculate payment amount. Resolves to the quote, or null when a newer
  // request superseded this one.
  const calculatePaymentAmount = useCallback(
    async (
      topupAmount: number,
      paymentType: string
    ): Promise<PaymentQuote | null> => {
      const requestId = ++quoteRequestId.current
      setCalculating(true)
      let calculated: PaymentQuote
      try {
        calculated = await requestPaymentQuote(topupAmount, paymentType)
      } catch {
        calculated = { amount: 0 }
      }
      if (requestId !== quoteRequestId.current) {
        return null
      }
      calculated = { ...calculated, requestAmount: topupAmount, paymentType }
      setAmount(calculated.amount)
      setQuote(calculated)
      setCalculating(false)
      return calculated
    },
    []
  )

  // Process payment. expectedCreditQuota is the credit the customer
  // confirmed for a coin-priced crypto order; when the order would credit
  // something else, no checkout opens and the new quote is shown instead.
  const processPayment = useCallback(
    async (
      topupAmount: number,
      paymentType: string,
      expectedCreditQuota?: number
    ) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
              ...(expectedCreditQuota
                ? { expected_credit_quota: expectedCreditQuota }
                : {}),
            })

        if (!isStripe && expectedCreditQuota) {
          const paid = response as PaymentResponse
          const changed =
            paid.quote_changed === true ||
            (isApiSuccess(paid) &&
              typeof paid.credit_quota === 'number' &&
              paid.credit_quota !== expectedCreditQuota)
          if (changed && typeof paid.credit_quota === 'number') {
            quoteRequestId.current++
            const updated = quoteFromPaymentResponse(
              paid,
              topupAmount,
              paymentType
            )
            setAmount(updated.amount)
            setQuote(updated)
            setCalculating(false)
            toast.warning(
              i18next.t(
                'The exchange rate has been updated. Please review and confirm again.'
              )
            )
            return false
          }
        }

        if (!isApiSuccess(response)) {
          handleServerError(response, i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        if (isStripe && response.data?.pay_link) {
          window.open(response.data.pay_link as string, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        // peroai: the server already created the gateway order and returns
        // only its checkout page.
        const checkoutUrl = (response.data as { checkout_url?: unknown })
          ?.checkout_url
        if (!isStripe && typeof checkoutUrl === 'string') {
          if (!openCheckoutUrl(checkoutUrl)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        // Handle non-Stripe payment
        if (!isStripe && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    quote,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
