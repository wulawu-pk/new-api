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

  // A pane's title bar is its first child, so padding on the pane itself
  // squeezes the title bar inside it (shorter rule, title pressed against
  // the content). Titled panes pad an inner body instead.
  it('never pads a titled pane itself', () => {
    // Zero padding (e.g. a pane flattened on phones) is fine.
    const padding = /(?:^|\s)(?:max-\w+:)?p[xytblr]?-(?!0(?:\s|$))/
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split(/<Pane\b/)
        .slice(1)
        .map((rest) => {
          // The opening tag: one line, or up to the line that closes it
          // (titles hold JSX, so `>` alone does not end the tag).
          const firstLine = rest.slice(0, rest.indexOf('\n')).trimEnd()
          if (firstLine.endsWith('>')) return firstLine
          return rest.slice(0, rest.search(/\n\s*\/?>/))
        })
        .filter((tag) => tag.includes('title='))
        .map((tag) => /className='([^']*)'/.exec(tag)?.[1] ?? '')
        .filter((classes) => padding.test(classes))
        .map((classes) => `${file.slice(SRC.length + 1)}: ${classes}`)
    )
    expect(offenders).toEqual([])
  })
})
