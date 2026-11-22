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
import { describe, expect, it } from 'vitest'

import { successRateClass } from '../success-rate'

describe('successRateClass', () => {
  it('is green from 90%, orange from 80% and red below', () => {
    expect(successRateClass(100)).toBe('text-t-ok')
    expect(successRateClass(90)).toBe('text-t-ok')
    expect(successRateClass(89.9)).toBe('text-t-warn')
    expect(successRateClass(80)).toBe('text-t-warn')
    expect(successRateClass(79.9)).toBe('text-t-bad')
    expect(successRateClass(0)).toBe('text-t-bad')
  })
})
