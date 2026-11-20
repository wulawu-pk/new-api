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
import type { PaymentMethod } from '@/features/wallet/types'

const NETWORK_NAMES: Record<string, string> = {
  trc20: 'TRC20',
  bsc: 'BSC',
  erc20: 'ERC20',
  solana: 'Solana',
}

export function networkName(network: string): string {
  return NETWORK_NAMES[network.toLowerCase()] ?? network.toUpperCase()
}

/** `usdt.trc20` → { coin: 'USDT', network: 'trc20' }, or null. */
export function splitCryptoMethod(
  type: string
): { coin: string; network: string } | null {
  const [coin, network] = type.toLowerCase().split('.')
  if ((coin === 'usdt' || coin === 'usdc') && network) {
    return { coin: coin.toUpperCase(), network }
  }
  return null
}

/** Coins offered by the crypto methods, in configured order. */
export function cryptoCoins(methods: PaymentMethod[]): string[] {
  const coins: string[] = []
  for (const method of methods) {
    const parts = splitCryptoMethod(method.type)
    if (parts && !coins.includes(parts.coin)) coins.push(parts.coin)
  }
  return coins
}

/** Networks offered for a coin: method types like `usdt.bsc`. */
export function networksOf(
  methods: PaymentMethod[],
  coin: string
): PaymentMethod[] {
  return methods.filter(
    (method) => splitCryptoMethod(method.type)?.coin === coin
  )
}

/** Methods the console's online top-up pane handles (no Stripe/Waffo/Creem). */
export function regularMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return methods.filter(
    (method) =>
      method.type !== 'stripe' &&
      !method.type.startsWith('waffo') &&
      method.type !== 'creem'
  )
}
