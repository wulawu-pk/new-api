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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useCreditGroupLabel } from '../use-credit-group-labels'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCreditGroupLabel', () => {
  it('labels the credit-billed group from the cached pricing payload', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            model_name: 'claude-shared',
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ['claude-kiro', 'claude-ccmax'],
            billing_mode: 'tiered_expr',
            billing_expr:
              'u("provider") == "kiro" ? tier("credit", u("credits") * 0.135135135135 * 1000000) : tier("token", p * 2 + c * 10)',
          },
        ],
        vendors: [],
        group_ratio: { 'claude-kiro': 1.85, 'claude-ccmax': 1.85 },
        usable_group: {},
      },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = (props: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useCreditGroupLabel(), { wrapper })

    await waitFor(() =>
      expect(result.current('claude-kiro', 1.85)).toBe('$0.25 / credit')
    )
    expect(get).toHaveBeenCalledWith('/api/pricing')
    expect(result.current('claude-ccmax', 1.85)).toBeNull()
    expect(result.current('claude-kiro', 'auto')).toBeNull()
    expect(result.current('claude-kiro', undefined)).toBeNull()
  })
})
