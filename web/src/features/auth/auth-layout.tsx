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
import type { ReactNode } from 'react'

import { TerminalAuthFrame } from '@/components/terminal/terminal-auth-frame'

type AuthLayoutProps = {
  children: ReactNode
  /** Title on the dialog border; defaults to the site name. */
  title?: ReactNode
}

/**
 * peroai v3: auth pages that keep their upstream form (two-step
 * verification, reset-link confirmation, OAuth callback) render inside the
 * same terminal dialog as sign-in.
 */
export function AuthLayout(props: AuthLayoutProps) {
  return (
    <TerminalAuthFrame title={props.title ?? 'peroai'}>
      <div className='flex flex-col gap-4 [&_h2]:text-lg [&_h2]:font-bold'>
        {props.children}
      </div>
    </TerminalAuthFrame>
  )
}
