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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { TermErrorPage } from './term-error-page'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  error?: unknown
  /** Display-only status code for a standalone route with no HTTP error. */
  statusCode?: number
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const response = (error as Record<string, unknown>).response
  if (typeof response !== 'object' || response === null) return undefined
  const status = (response as Record<string, unknown>).status
  return typeof status === 'number' ? status : undefined
}

export function GeneralError({
  className,
  minimal = false,
  error,
  statusCode,
}: GeneralErrorProps) {
  const { t, i18n } = useTranslation()
  useEffect(() => {
    if (
      !(error instanceof Error) ||
      (error.name !== 'ChunkLoadError' &&
        !/^Loading (CSS )?chunk .+ failed\./.test(error.message))
    ) {
      return
    }

    // Recover only when the failed route is displayed, never on intent preload.
    // Keep the marker across reloads so a persistent failure shows this page.
    try {
      const key = `tanstack_router_reload:${error.message}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // Without a persistent marker, reloading could loop indefinitely.
      return
    }
    window.location.reload()
  }, [error])

  const status = getHttpStatus(error) ?? statusCode
  const isRateLimited = status === 429
  const title = isRateLimited
    ? t('Too many requests')
    : t('Oops! Something went wrong')
  const description = isRateLimited
    ? t('Please wait a moment before trying again.')
    : t('Please try again later.')
  // Chinese sentences end in full-width punctuation; a space between them
  // reads as a typo. Other languages keep the separator.
  const language = i18n.resolvedLanguage ?? i18n.language ?? ''
  const separator = language.startsWith('zh') ? '' : ' '

  return (
    <TermErrorPage
      code={status !== undefined ? String(status) : undefined}
      title={title}
      description={`${t('We apologize for the inconvenience.')}${separator}${description}`}
      className={className}
      minimal={minimal}
    />
  )
}
