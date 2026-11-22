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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { LoadErrorText } from '@/components/terminal/data-states'
import { errorReason, prefersReducedMotion } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import { TermSegmented } from '@/components/terminal/term-segmented'
import { Button } from '@/components/ui/button'
import { getPrivacyPolicy, getUserAgreement } from '@/features/legal/api'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { cn } from '@/lib/utils'

import { CONSOLE_WINDOWS, LEGAL_PAGES, type LegalPageKey } from '../lib/windows'
import { ConsolePageHeader } from '../shell/console-shell'
import { PRIVACY_POLICY_EN } from './translations/privacy-policy.en'
import { USER_AGREEMENT_EN } from './translations/user-agreement.en'

/**
 * Same endpoints and query keys as the old legal pages, so they share a
 * cache. The documents are written in Chinese (admin settings); an English
 * translation ships with the console for every non-Chinese interface.
 */
const SOURCES = {
  terms: {
    queryKey: 'user-agreement',
    api: '/api/user-agreement',
    file: 'user-agreement.md',
    fetch: getUserAgreement,
    english: USER_AGREEMENT_EN,
    emptyKey: 'The administrator has not configured a user agreement yet.',
  },
  privacy: {
    queryKey: 'privacy-policy',
    api: '/api/privacy-policy',
    file: 'privacy-policy.md',
    fetch: getPrivacyPolicy,
    english: PRIVACY_POLICY_EN,
    emptyKey: 'The administrator has not configured a privacy policy yet.',
  },
} as const

/** Pages of this app; any other same-site path is a static page (docs, home). */
const APP_PATHS = new Set<string>([
  ...LEGAL_PAGES.map((page) => page.path),
  ...CONSOLE_WINDOWS.map((win) => win.path),
])

/*
 * Body text of a legal document in the console palette. The shared
 * Markdown component brings the prose layout; these override its shadcn
 * colours (primary links, muted code) with the terminal ones and give
 * long-form reading a calmer size and line height.
 */
const DOC_PROSE = cn(
  'text-t-fg2 text-[15px] leading-[1.9]',
  '[&_h2]:text-t-fg [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em]',
  '[&_h3]:text-t-fg [&_h3]:mt-6 [&_h3]:text-[15px]',
  '[&_strong]:text-t-fg [&_p]:my-3 [&_li]:my-1.5 [&_li]:pl-1.5 [&_ol]:pl-6 [&_ul]:pl-6',
  '[&_li::marker]:text-t-dim [&_li::marker]:font-mono [&_li::marker]:text-[12.5px]',
  '[&_a]:text-(--t-accent) [&_a]:decoration-(--t-accent)/40 [&_a]:underline-offset-4 hover:[&_a]:decoration-(--t-accent)',
  '[&_code]:bg-t-ink/6 [&_code]:text-t-fg [&_code]:text-[13px]',
  '[&_hr]:border-t-line [&_table]:text-[13.5px] [&_thead]:bg-t-ink/4 [&_td]:border-t-line [&_th]:border-t-line [&_th]:text-t-fg'
)

/**
 * User agreement and privacy policy in the console shell: the document in
 * a pane, an outline of its sections on the left (wide screens), and a
 * switch between the two documents.
 */
export function ConsoleLegal(props: { doc: LegalPageKey }) {
  const { t, i18n } = useTranslation()
  const source = SOURCES[props.doc]
  const english = !(i18n.resolvedLanguage || i18n.language || '')
    .toLowerCase()
    .startsWith('zh')
  const page = LEGAL_PAGES.find((item) => item.key === props.doc)
  const title = t(page?.labelKey ?? 'User Agreement')
  const query = useQuery({
    queryKey: [source.queryKey],
    queryFn: source.fetch,
    staleTime: 10 * 60 * 1000,
    meta: { errorToast: false },
    enabled: !english,
  })
  const navigate = useNavigate()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [outline, setOutline] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const served = query.data?.success ? (query.data.data?.trim() ?? '') : ''
  const raw = english ? source.english.trim() : served
  const loading = !english && query.isPending
  const failed = !english && query.isError
  const isUrl = raw !== '' && isHttpUrl(raw)
  const isHtml = raw !== '' && !isUrl && isLikelyHtml(raw)
  const isMarkdown = raw !== '' && !isUrl && !isHtml

  // The outline is read back from the rendered section headings, so it
  // always matches what is shown. Headings are looked up by position each
  // time: React rewrites the Markdown's innerHTML on every render, so ids
  // or node references set on them would not last.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const headings = body && isMarkdown ? body.querySelectorAll('h2') : []
    setOutline([...headings].map((h) => h.textContent?.trim() ?? ''))
    setActiveIndex(0)
  }, [raw, isMarkdown])

  // The outline marks the section being read: the last heading that has
  // passed the top quarter of the window.
  useEffect(() => {
    if (outline.length === 0) return
    let frame = 0
    const update = () => {
      frame = 0
      const headings = bodyRef.current?.querySelectorAll('h2') ?? []
      const line = window.innerHeight * 0.25
      let current = 0
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= line) current = index
      })
      setActiveIndex(current)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [outline])

  const showOutline = outline.length > 1

  // One centred reading column (outline + document) rather than the full
  // console width, so the text column and the page header line up.
  return (
    <div className='mx-auto flex w-full max-w-[1080px] flex-col gap-[34px]'>
      <ConsolePageHeader
        title={title}
        description={t(
          'Applies to peroai.cc, api.peroai.cc and the console. Signing up or signing in means you accept both documents.'
        )}
        actions={
          <TermSegmented
            label={t('Legal documents')}
            memoryKey='legal'
            value={props.doc}
            items={LEGAL_PAGES.map((item) => ({
              value: item.key,
              label: t(item.labelKey),
              to: item.path,
            }))}
          />
        }
      />

      <div
        className={cn(
          'grid items-start gap-x-10 gap-y-6',
          showOutline && 'lg:grid-cols-[200px_minmax(0,1fr)]'
        )}
      >
        {showOutline && (
          <nav
            aria-label={t('On this page')}
            className='sticky top-[88px] max-h-[calc(100svh-140px)] [scrollbar-width:none] overflow-auto max-lg:hidden'
          >
            <p className='text-t-faint mb-2.5 font-mono text-[11px]'>
              {'// '}
              {t('On this page')}
            </p>
            {outline.map((text, index) => (
              <button
                // Headings can repeat; their position is what identifies them.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                type='button'
                aria-current={activeIndex === index ? 'location' : undefined}
                onClick={() => {
                  const heading = bodyRef.current?.querySelectorAll('h2')[index]
                  heading?.scrollIntoView({
                    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                    block: 'start',
                  })
                  setActiveIndex(index)
                }}
                className={cn(
                  'block w-full py-1 pl-3.5 text-left text-[13px] leading-normal transition-[color,box-shadow] duration-200',
                  activeIndex === index
                    ? 'text-t-fg shadow-[inset_2px_0_0_var(--t-accent)]'
                    : 'text-t-dim hover:text-t-fg shadow-[inset_1px_0_0_var(--t-line)]'
                )}
              >
                {text}
              </button>
            ))}
          </nav>
        )}

        <Pane
          title={<b>{source.file}</b>}
          aria-label={title}
          className='min-w-0'
        >
          <div className='px-10 pt-8 pb-10 max-sm:px-5 max-sm:pt-6 max-sm:pb-8'>
            {loading && (
              <div aria-hidden='true' className='flex flex-col gap-3 py-2'>
                {[34, 52, 46, 28].map((width) => (
                  <span key={width} className='t-skeleton font-mono'>
                    {'░'.repeat(width)}
                  </span>
                ))}
              </div>
            )}
            {failed && (
              <LoadErrorText
                api={source.api}
                reason={errorReason(query.error)}
                onRetry={() => void query.refetch()}
              />
            )}
            {!english && query.data && raw === '' && (
              <p className='text-t-dim m-0 text-sm'>
                {query.data.message || t(source.emptyKey)}
              </p>
            )}
            {isUrl && (
              <div className='flex flex-col items-start gap-3'>
                <p className='text-t-fg2 m-0 text-sm'>
                  {t(
                    'The administrator configured an external link for this document.'
                  )}
                </p>
                <Button
                  variant='outline'
                  className='rounded-full'
                  render={
                    <a href={raw} target='_blank' rel='noopener noreferrer' />
                  }
                >
                  {t('View document')}
                </Button>
              </div>
            )}
            {isHtml && (
              <RichContent mode='html' htmlVariant='isolated' content={raw} />
            )}
            {english && (
              <p className='text-t-dim border-t-line m-0 mb-6 border-b pb-5 text-[13.5px] leading-[1.7] italic'>
                {t(
                  'This English translation is provided for convenience. If it differs from the Chinese version, the Chinese version prevails.'
                )}
              </p>
            )}
            {isMarkdown && (
              // The shared Markdown opens every link in a new tab. Links to
              // this site stay in the window: the other legal document and
              // console pages switch in place, static pages (docs) load
              // here. Other sites, mail links and modified clicks are left
              // to the browser.
              <div
                ref={bodyRef}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return
                  }
                  const link = (event.target as Element).closest('a[href]')
                  if (!link) return
                  const url = new URL(
                    link.getAttribute('href') ?? '',
                    window.location.href
                  )
                  if (url.origin !== window.location.origin) return
                  event.preventDefault()
                  if (APP_PATHS.has(url.pathname)) {
                    void navigate({
                      href: url.pathname + url.search + url.hash,
                    })
                    return
                  }
                  window.location.assign(url.href)
                }}
              >
                <RichContent
                  mode='markdown'
                  content={raw}
                  className={DOC_PROSE}
                />
              </div>
            )}
          </div>
        </Pane>
      </div>
    </div>
  )
}
