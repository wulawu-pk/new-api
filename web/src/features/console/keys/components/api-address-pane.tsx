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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Pane } from '@/components/terminal/pane'
import { TERM_BUTTON_GHOST } from '@/components/terminal/styles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'

import { apiBaseUrl } from '../lib/api-address'

/**
 * The two addresses to copy, above the key list so a long list never pushes
 * them out of sight: one compact row, the two addresses side by side.
 */
export function ApiAddressPane() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const base = apiBaseUrl(status?.server_address)

  const rows = [
    {
      id: 'openai',
      label: t('OpenAI compatible / Codex'),
      value: `${base}/v1`,
    },
    {
      id: 'claude',
      label: 'Claude Code',
      value: base,
    },
    {
      id: 'gemini-sdk',
      label: t('Gemini SDK base URL'),
      value: base,
    },
    {
      id: 'gemini-rest',
      label: t('Gemini REST /v1beta'),
      value: `${base}/v1beta`,
      recommended: true,
    },
  ]

  const copy = async (label: string, value: string) => {
    if (await copyToClipboard(value)) {
      toast.success(t('Copied the {{name}} address', { name: label }))
    } else toast.error(t('Copy failed; select and copy it manually'))
  }

  return (
    <Pane title={<b>{t('API address')}</b>}>
      <div className='grid grid-cols-2 gap-x-6 px-[18px] py-2 max-lg:grid-cols-1'>
        {rows.map((row) => (
          <div
            key={row.id}
            className='max-lg:border-t-line grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 py-2 text-sm max-lg:border-t max-lg:first:border-t-0 max-sm:grid-cols-[1fr_auto]'
          >
            <span className='text-t-dim max-sm:col-span-2'>
              {row.label}
              {row.recommended && (
                <Badge
                  variant='secondary'
                  className='ml-1.5 align-middle text-[10px]'
                >
                  {t('Recommended')}
                </Badge>
              )}
            </span>
            <span className='min-w-0 font-mono break-all select-all'>
              {row.value}
            </span>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className={TERM_BUTTON_GHOST}
              onClick={() => void copy(row.label, row.value)}
              aria-label={t('Copy {{name}}', { name: row.label })}
            >
              {t('Copy')}
            </Button>
          </div>
        ))}
      </div>
    </Pane>
  )
}
