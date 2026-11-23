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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ConsoleWallet } from '@/features/console/wallet'

// peroai v3: /wallet is the console wallet (window 4). `show_history` is
// still accepted from payment return links; the history is always shown.
// `pay=return` is where the gateway sends the browser back after paying
// (/payment-return 302s here, dropping every gateway parameter).
const walletSearchSchema = z.object({
  show_history: z.boolean().optional(),
  pay: z.enum(['return']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/wallet/')({
  component: WalletPage,
  validateSearch: walletSearchSchema,
})

function WalletPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ConsoleWallet
      paymentReturn={search.pay === 'return'}
      onPaymentReturnHandled={() =>
        void navigate({
          search: (prev) => ({ ...prev, pay: undefined }),
          replace: true,
        })
      }
    />
  )
}
