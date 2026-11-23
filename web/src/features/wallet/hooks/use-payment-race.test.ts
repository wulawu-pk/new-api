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
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { AmountResponse, PaymentResponse } from '../types'

const apiMocks = vi.hoisted(() => ({
  calculateAmount: vi.fn<(request: unknown) => Promise<AmountResponse>>(),
  requestPayment: vi.fn<(request: unknown) => Promise<PaymentResponse>>(),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    calculateAmount: apiMocks.calculateAmount,
    requestPayment: apiMocks.requestPayment,
  }
})

const { isQuoteFor, usePayment } = await import('./use-payment')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function coinQuote(coins: number): AmountResponse {
  return {
    success: true,
    data: String(coins),
    currency: 'USDT',
    rate: '6.67',
    credit_quota: coins * 3_335_000,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  apiMocks.calculateAmount.mockReset()
  apiMocks.requestPayment.mockReset()
})

describe('payment quotes', () => {
  test('a late answer to an older request does not replace the newest quote', async () => {
    const first = deferred<AmountResponse>()
    const second = deferred<AmountResponse>()
    apiMocks.calculateAmount
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => usePayment())

    let firstResult: unknown
    let secondResult: unknown
    await act(async () => {
      const a = result.current.calculatePaymentAmount(1, 'usdt.trc20')
      const b = result.current.calculatePaymentAmount(100, 'usdt.trc20')
      second.resolve(coinQuote(100))
      secondResult = await b
      first.resolve(coinQuote(1))
      firstResult = await a
    })

    expect(firstResult).toBeNull()
    expect(secondResult).toMatchObject({ amount: 100, requestAmount: 100 })
    expect(result.current.amount).toBe(100)
    expect(result.current.quote).toMatchObject({
      amount: 100,
      creditQuota: 333_500_000,
      requestAmount: 100,
      paymentType: 'usdt.trc20',
    })
    expect(result.current.calculating).toBe(false)
    expect(isQuoteFor(result.current.quote, 100, 'usdt.trc20')).toBe(true)
    expect(isQuoteFor(result.current.quote, 1, 'usdt.trc20')).toBe(false)
    expect(isQuoteFor(result.current.quote, 100, 'usdc.trc20')).toBe(false)
  })

  test('stays calculating until the newest request answers', async () => {
    const first = deferred<AmountResponse>()
    const second = deferred<AmountResponse>()
    apiMocks.calculateAmount
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => usePayment())

    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      void result.current.calculatePaymentAmount(1, 'usdt.trc20')
      pending = result.current.calculatePaymentAmount(5, 'usdt.trc20')
      first.resolve(coinQuote(1))
      await Promise.resolve()
    })
    expect(result.current.calculating).toBe(true)
    expect(result.current.quote.amount).toBe(0)

    await act(async () => {
      second.resolve(coinQuote(5))
      await pending
    })
    expect(result.current.calculating).toBe(false)
    expect(result.current.quote.requestAmount).toBe(5)
  })

  test('a failed quote is not confirmable', async () => {
    apiMocks.calculateAmount.mockResolvedValue({
      success: false,
      message: 'error',
      data: 'Exchange rate is temporarily unavailable, please try again later',
    } as AmountResponse)
    const { result } = renderHook(() => usePayment())

    let quote: unknown
    await act(async () => {
      quote = await result.current.calculatePaymentAmount(3, 'usdt.trc20')
    })
    expect(quote).toMatchObject({ amount: 0 })
    expect(isQuoteFor(result.current.quote, 3, 'usdt.trc20')).toBe(false)
  })
})

/** The quote the customer confirmed: 1 USDT for 3_335_000 quota. */
const CONFIRMED = {
  amount: 1,
  currency: 'USDT',
  rate: 6.67,
  creditQuota: 3_335_000,
  requestAmount: 1,
  paymentType: 'usdt.trc20',
}

describe('coin-priced payment', () => {
  test('opens the checkout page the server returned', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: true,
      message: 'success',
      data: { checkout_url: 'https://peroai.cc/pay/checkout/T1' },
      url: 'https://peroai.cc/pay/checkout/T1',
      credit_quota: 3_335_000,
    } as PaymentResponse)
    const popup = { opener: {} } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20', CONFIRMED)
    })

    expect(ok).toBe(true)
    expect(apiMocks.requestPayment).toHaveBeenCalledWith({
      amount: 1,
      payment_method: 'usdt.trc20',
      expected_credit_quota: 3_335_000,
    })
    expect(open).toHaveBeenCalledWith(
      'https://peroai.cc/pay/checkout/T1',
      '_blank'
    )
    expect(popup.opener).toBeNull()
  })

  test('shows the new quote instead of the checkout when the rate moved', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: false,
      message: 'error',
      data: 'The exchange rate has been updated. Please review and confirm again.',
      quote_changed: true,
      currency: 'USDT',
      rate: '6.5',
      credit_quota: 3_250_000,
    } as unknown as PaymentResponse)
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20', CONFIRMED)
    })

    expect(ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(result.current.quote).toMatchObject({
      creditQuota: 3_250_000,
      rate: 6.5,
      requestAmount: 1,
      paymentType: 'usdt.trc20',
    })
  })

  test('does not open a checkout URL that is not http(s)', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: true,
      message: 'success',
      data: { checkout_url: 'javascript:alert(1)' },
    } as PaymentResponse)
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20')
    })
    expect(ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  test('orders the coins of the confirmed quote, not the typed amount', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: true,
      message: 'success',
      data: { checkout_url: 'https://peroai.cc/pay/checkout/T2' },
      credit_quota: 3 * 3_335_000,
    } as PaymentResponse)
    vi.spyOn(window, 'open').mockReturnValue({ opener: {} } as Window)
    const { result } = renderHook(() => usePayment())
    const confirmed = {
      ...CONFIRMED,
      amount: 3,
      requestAmount: 3,
      creditQuota: 3 * 3_335_000,
    }

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(3.7, 'usdt.trc20', confirmed)
    })

    expect(ok).toBe(true)
    expect(apiMocks.requestPayment).toHaveBeenCalledWith({
      amount: 3,
      payment_method: 'usdt.trc20',
      expected_credit_quota: 3 * 3_335_000,
    })
  })

  test('refuses a confirmed quote whose coins differ from what it was asked for', async () => {
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20', {
        ...CONFIRMED,
        amount: 2,
      })
    })

    expect(ok).toBe(false)
    expect(apiMocks.requestPayment).not.toHaveBeenCalled()
  })

  test.each([
    ['missing', undefined],
    ['zero', 0],
    ['fractional', 3_335_000.5],
    ['a string', '3335000'],
  ])(
    'does not open the checkout when credit_quota is %s',
    async (_label, creditQuota) => {
      apiMocks.requestPayment.mockResolvedValue({
        success: true,
        message: 'success',
        data: { checkout_url: 'https://peroai.cc/pay/checkout/T3' },
        url: 'https://peroai.cc/pay/checkout/T3',
        currency: 'USDT',
        rate: '6.67',
        credit_quota: creditQuota,
      } as unknown as PaymentResponse)
      const open = vi.spyOn(window, 'open')
      const { result } = renderHook(() => usePayment())

      let ok: unknown
      await act(async () => {
        ok = await result.current.processPayment(1, 'usdt.trc20', CONFIRMED)
      })

      expect(ok).toBe(false)
      expect(open).not.toHaveBeenCalled()
      // No usable quote came back, so the dialog must fetch a new one.
      expect(isQuoteFor(result.current.quote, 1, 'usdt.trc20')).toBe(false)
    }
  )

  test('does not open the checkout when the order credits something else', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: true,
      message: 'success',
      data: { checkout_url: 'https://peroai.cc/pay/checkout/T4' },
      url: 'https://peroai.cc/pay/checkout/T4',
      currency: 'USDT',
      rate: '6.5',
      credit_quota: 3_250_000,
    } as PaymentResponse)
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20', CONFIRMED)
    })

    expect(ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(result.current.quote).toMatchObject({
      amount: 1,
      creditQuota: 3_250_000,
      requestAmount: 1,
    })
  })

  test('does not open the checkout when the server echoes other coins', async () => {
    apiMocks.requestPayment.mockResolvedValue({
      success: true,
      message: 'success',
      data: '2' as unknown as Record<string, unknown>,
      url: 'https://peroai.cc/pay/checkout/T5',
      currency: 'USDT',
      rate: '6.67',
      credit_quota: 3_335_000,
    } as PaymentResponse)
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => usePayment())

    let ok: unknown
    await act(async () => {
      ok = await result.current.processPayment(1, 'usdt.trc20', CONFIRMED)
    })

    expect(ok).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
