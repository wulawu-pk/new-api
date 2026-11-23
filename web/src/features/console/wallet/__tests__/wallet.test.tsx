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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as profileApi from '@/features/profile/api'
import * as logsApi from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import * as walletApi from '@/features/wallet/api'
import { requestPaymentQuote } from '@/features/wallet/hooks/use-payment'
import type {
  AmountResponse,
  TopupInfo,
  TopupRecord,
} from '@/features/wallet/types'
import { useAuthStore } from '@/stores/auth-store'

import { ConsoleWallet } from '..'
import { renderConsole } from '../../__tests__/render-console'
import { OnlineTopupPane } from '../components/online-topup-pane'
import { mergeHistory, methodLabel, redeemRowFromLog } from '../lib/history'
import { cryptoCoins, networksOf, regularMethods } from '../lib/pay-methods'

vi.mock('@/features/profile/api', () => ({ getUserProfile: vi.fn() }))
vi.mock('@/features/usage-logs/api', () => ({ getUserLogs: vi.fn() }))
vi.mock('@/features/wallet/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/wallet/api')>()),
  getTopupInfo: vi.fn(),
  getUserBillingHistory: vi.fn(),
  calculateAmount: vi.fn(),
  requestPayment: vi.fn(),
}))

const REDEEM_LOG = {
  id: 9,
  created_at: 200,
  other: JSON.stringify({
    content_parts: [
      {
        key: 'Topped up {{quota}} with a redemption code, code ID {{id}}',
        params: { id: 2, quota: '＄200.000000' },
      },
    ],
  }),
} as UsageLog

const ORDER: TopupRecord = {
  id: 3,
  user_id: 2,
  amount: 33,
  money: 5,
  credit_quota: 16675000,
  trade_no: 'T',
  payment_method: 'usdt.bsc',
  create_time: 100,
  status: 'success',
}

beforeEach(() => {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 2, username: 'demo', role: 1 } as never,
    },
  }))
  vi.mocked(profileApi.getUserProfile).mockResolvedValue({
    success: true,
    data: {
      id: 2,
      username: 'demo',
      role: 1,
      quota: 0,
      used_quota: 0,
    } as never,
  })
  vi.mocked(walletApi.getTopupInfo).mockResolvedValue({
    success: true,
    data: {
      enable_online_topup: false,
      enable_stripe_topup: false,
      pay_methods: [],
      min_topup: 1,
      stripe_min_topup: 1,
      amount_options: [],
      discount: {},
      enable_redemption: true,
    },
  } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useAuthStore.getState().auth.reset('idle')
})

describe('wallet history', () => {
  it('reads the credited amount of a redeemed code from its log', () => {
    expect(redeemRowFromLog(REDEEM_LOG)).toMatchObject({
      kind: 'code',
      creditUSD: 200,
      status: 'success',
    })
    expect(redeemRowFromLog({ ...REDEEM_LOG, other: '{}' })).toBeNull()
  })

  it('merges orders and redeemed codes newest first', () => {
    const rows = mergeHistory([ORDER], [REDEEM_LOG])
    expect(rows.map((row) => row.kind)).toEqual(['code', 'order'])
    expect(rows[1]).toMatchObject({
      coin: 'USDT',
      paid: 5,
      creditQuota: 16675000,
    })
  })

  it('shows the method the payment actually arrived through', () => {
    const [row] = mergeHistory(
      [{ ...ORDER, actual_payment_method: 'usdc.trc20' }],
      []
    )
    expect(row).toMatchObject({ method: 'usdc.trc20', coin: 'USDC' })
    const [plain] = mergeHistory([{ ...ORDER, actual_payment_method: '' }], [])
    expect(plain).toMatchObject({ method: 'usdt.bsc', coin: 'USDT' })
  })

  it('labels crypto methods by coin and network', () => {
    expect(methodLabel('usdt.bsc')).toBe('USDT · BSC')
    expect(methodLabel('alipay', '支付宝')).toBe('支付宝')
  })

  it('groups crypto methods by coin and leaves out gateways the console does not handle', () => {
    const methods = [
      { name: 'USDT·TRC20', type: 'usdt.trc20' },
      { name: 'USDC·BSC', type: 'usdc.bsc' },
      { name: 'USDT·BSC', type: 'usdt.bsc' },
      { name: 'Stripe', type: 'stripe' },
    ]
    expect(cryptoCoins(methods)).toEqual(['USDT', 'USDC'])
    expect(networksOf(methods, 'USDT').map((m) => m.type)).toEqual([
      'usdt.trc20',
      'usdt.bsc',
    ])
    expect(regularMethods(methods)).toHaveLength(3)
  })
})

describe('console wallet page', () => {
  it('says where records will appear when there are none', async () => {
    vi.mocked(walletApi.getUserBillingHistory).mockResolvedValue({
      success: true,
      data: { items: [], total: 0 },
    } as never)
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderConsole(<ConsoleWallet />)

    expect(await screen.findByText(/No top-ups yet/)).toBeInTheDocument()
    expect(screen.getByText(/Online top-up is not enabled/)).toBeInTheDocument()
    expect(screen.getByLabelText('Card code')).toBeInTheDocument()
  })

  it('lists a redeemed code with its credited amount', async () => {
    vi.mocked(walletApi.getUserBillingHistory).mockResolvedValue({
      success: true,
      data: { items: [], total: 0 },
    } as never)
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [REDEEM_LOG], total: 1, page: 1, page_size: 20 },
    })
    renderConsole(<ConsoleWallet />)

    expect(await screen.findByText('$200.00')).toBeInTheDocument()
  })

  it('names the failed endpoint when the history cannot load', async () => {
    vi.mocked(walletApi.getUserBillingHistory).mockResolvedValue({
      success: false,
      message: 'nope',
    } as never)
    vi.mocked(logsApi.getUserLogs).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 20 },
    })
    renderConsole(<ConsoleWallet />)

    expect(await screen.findByText('/api/user/topup/self')).toBeInTheDocument()
  })
})

const CRYPTO_TOPUP: TopupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  crypto_usd_topup: true,
  pay_methods: [{ name: 'USDT·TRC20', type: 'usdt.trc20' }],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [],
  discount: {},
} as never

const FULL_QUOTE: AmountResponse = {
  success: true,
  data: '5',
  currency: 'USDT',
  rate: '7.10',
  credit_quota: 17_750_000,
}

const regularOnly = (response: AmountResponse) => ({
  regular: async () => response,
  stripe: async () => ({ success: true, data: '0' }),
  waffo: async () => ({ success: true, data: '0' }),
  waffoPancake: async () => ({ success: true, data: '0' }),
})

describe('coin quote validation', () => {
  it('accepts a quote with coins, coin, rate and credited quota', async () => {
    expect(
      await requestPaymentQuote(5, 'usdt.trc20', regularOnly(FULL_QUOTE))
    ).toEqual({
      amount: 5,
      currency: 'USDT',
      rate: 7.1,
      creditQuota: 17_750_000,
    })
  })

  it.each([
    ['currency', { ...FULL_QUOTE, currency: undefined }],
    ['rate', { ...FULL_QUOTE, rate: undefined }],
    ['credit_quota', { ...FULL_QUOTE, credit_quota: undefined }],
    ['a non-numeric rate', { ...FULL_QUOTE, rate: 'abc' }],
    ['a zero rate', { ...FULL_QUOTE, rate: '0' }],
    ['a negative credit', { ...FULL_QUOTE, credit_quota: -1 }],
    ['a fractional credit', { ...FULL_QUOTE, credit_quota: 1.5 }],
    ['a non-numeric coin amount', { ...FULL_QUOTE, data: 'NaN' }],
  ])('refuses a coin quote with missing or invalid %s', async (_, response) => {
    const quote = await requestPaymentQuote(
      5,
      'usdt.trc20',
      regularOnly(response as AmountResponse)
    )
    expect(quote.amount).toBe(0)
    expect(quote.error).toBe(
      'Could not get a price for this amount. Please try again in a moment.'
    )
  })

  it('leaves quotes of methods that are not coin-priced alone', async () => {
    expect(
      await requestPaymentQuote(
        5,
        'alipay',
        regularOnly({ success: true, data: '5.00' })
      )
    ).toEqual({
      amount: 5,
      currency: undefined,
      rate: undefined,
      creditQuota: undefined,
    })
  })
})

describe('console online top-up: coin quote', () => {
  async function submit(response: AmountResponse) {
    vi.mocked(walletApi.calculateAmount).mockResolvedValue(response)
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    renderConsole(
      <OnlineTopupPane topupInfo={CRYPTO_TOPUP} onPaid={() => {}} />
    )
    await user.click(
      await screen.findByRole('button', { name: 'Go to payment' })
    )
    return { error, user }
  }

  it('does not open the confirm dialog when the quote has no credited quota', async () => {
    const { error } = await submit({ ...FULL_QUOTE, credit_quota: undefined })

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Could not get a price for this amount. Please try again in a moment.'
      )
    )
    expect(screen.queryByText('Confirm Payment')).toBeNull()
    expect(walletApi.requestPayment).not.toHaveBeenCalled()
  })

  it('does not open the confirm dialog when the rate is not a number', async () => {
    const { error } = await submit({ ...FULL_QUOTE, rate: 'n/a' })

    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(screen.queryByText('Confirm Payment')).toBeNull()
    expect(walletApi.requestPayment).not.toHaveBeenCalled()
  })

  it('opens the confirm dialog for a complete quote', async () => {
    const { error } = await submit(FULL_QUOTE)

    expect(await screen.findAllByText('Confirm Payment')).not.toHaveLength(0)
    expect(error).not.toHaveBeenCalled()
  })

  it('orders the confirmed quote and opens no checkout without a matching credit', async () => {
    vi.mocked(walletApi.requestPayment).mockResolvedValue({
      success: true,
      message: 'success',
      data: { checkout_url: 'https://peroai.cc/pay/checkout/T' },
      url: 'https://peroai.cc/pay/checkout/T',
    })
    const open = vi.spyOn(window, 'open')
    const onPaid = vi.fn()
    vi.mocked(walletApi.calculateAmount).mockResolvedValue(FULL_QUOTE)
    vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const user = userEvent.setup()
    renderConsole(<OnlineTopupPane topupInfo={CRYPTO_TOPUP} onPaid={onPaid} />)
    await user.click(
      await screen.findByRole('button', { name: 'Go to payment' })
    )
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Confirm Payment',
    })
    await waitFor(() => expect(confirm).toBeEnabled())
    await user.click(confirm)

    await waitFor(() =>
      expect(walletApi.requestPayment).toHaveBeenCalledWith({
        amount: 5,
        payment_method: 'usdt.trc20',
        expected_credit_quota: 17_750_000,
      })
    )
    expect(open).not.toHaveBeenCalled()
    expect(onPaid).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
