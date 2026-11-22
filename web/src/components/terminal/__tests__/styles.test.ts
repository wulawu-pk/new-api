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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Vitest runs from `web/`.
const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('terminal class names', () => {
  // Tailwind reads `border-t-accent` two ways at once: the console's accent on
  // every side, and the shared theme's dark `--accent` on the top side only.
  // The second wins on the top edge, so a focused input, a checked radio or a
  // pressed chip shows a dark top border. `border-(--t-accent)` means one thing.
  it('never colour a border with the ambiguous border-t-accent', () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /(?<![\w-])border-t-accent\b/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders.map((file) => file.slice(SRC.length + 1))).toEqual([])
  })
})
