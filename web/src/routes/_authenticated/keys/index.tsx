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
import z from 'zod'

import { ConsoleKeys } from '@/features/console/keys'

// peroai v3: /keys is the console key list (window 2). `create` opens the
// create-key dialog (used by the status-bar `n` shortcut and onboarding).
const apiKeySearchSchema = z.object({
  create: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/keys/')({
  validateSearch: apiKeySearchSchema,
  component: KeysPage,
})

function KeysPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ConsoleKeys
      openCreate={search.create}
      onOpenCreateHandled={() => void navigate({ search: {}, replace: true })}
    />
  )
}
