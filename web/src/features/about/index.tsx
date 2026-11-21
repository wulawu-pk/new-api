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
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import AsciiRipple from '@/components/react-bits/ascii-ripple'
import CipherReveal from '@/components/react-bits/cipher-reveal'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { LANDING_COLOR_VARS } from '@/features/home/constants'
import { useCssColors } from '@/hooks/use-css-colors'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getAboutContent } from './api'

const RIPPLE_TEXT = Array.from(
  { length: 24 },
  () =>
    'one key · every model · openai · claude · gemini · deepseek · qwen · route · balance · bill · observe ·'
).join(' ')

const linkClass =
  'text-foreground decoration-landing-accent/60 hover:decoration-landing-accent underline decoration-1 underline-offset-4 transition-colors duration-200'

/** Interactive ASCII field: framed panel at the top of the About page. */
function AboutBanner() {
  const colors = useCssColors(LANDING_COLOR_VARS)
  return (
    <div
      aria-hidden
      className='border-border bg-muted/30 relative h-56 overflow-hidden rounded-3xl border sm:h-72'
    >
      <AsciiRipple
        text={RIPPLE_TEXT}
        fontSize={13}
        fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
        textColor={colors.muted}
        rippleColor={colors.accent}
        troughColor={colors.foreground}
        textOpacity={0.35}
        rain={0.35}
        vignette={0.35}
      />
      <span className='font-ascii text-muted-foreground bg-background/85 ring-border absolute bottom-4 left-4 rounded-md px-2 py-1 text-[11px] ring-1 backdrop-blur'>
        ~/about $ cat README
        <span className='ascii-caret'>_</span>
      </span>
    </div>
  )
}

function EmptyAboutState() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  const facts = [
    {
      index: '01',
      title: t('New API Project Repository:'),
      body: (
        <a
          href='https://github.com/QuantumNous/new-api'
          target='_blank'
          rel='noopener noreferrer'
          className={linkClass}
        >
          {t('https://github.com/QuantumNous/new-api')}
        </a>
      ),
    },
    {
      index: '02',
      title: t('Credits'),
      body: (
        <>
          <a
            href='https://github.com/QuantumNous/new-api'
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('NewAPI')}
          </a>{' '}
          © {currentYear}{' '}
          <a
            href='https://github.com/QuantumNous'
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('QuantumNous')}
          </a>{' '}
          {t('| Based on')}{' '}
          <a
            href='https://github.com/songquanpeng/one-api'
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('One API')}
          </a>{' '}
          © 2023{' '}
          <a
            href='https://github.com/songquanpeng'
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('JustSong')}
          </a>
        </>
      ),
    },
    {
      index: '03',
      title: t('License'),
      body: (
        <>
          {t('This project must be used in compliance with the')}{' '}
          <a
            href='https://github.com/QuantumNous/new-api/blob/main/LICENSE'
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('AGPL v3.0 License')}
          </a>
          .
        </>
      ),
    },
  ]

  return (
    <section className='px-4 pt-28 pb-24 sm:px-6 lg:pt-32'>
      <div className='mx-auto w-full max-w-7xl'>
        <AboutBanner />

        <div className='mt-14 grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20'>
          <div className='lg:sticky lg:top-28'>
            <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
              [ {t('About')} ]
            </p>
            <CipherReveal
              as='h1'
              text={t('No About Content Set')}
              trigger='mount'
              align='left'
              fontSize='clamp(2rem, 4vw, 3.25rem)'
              lineHeight={1.08}
              className='mt-4 text-balance'
            />
            <p className='text-muted-foreground mt-5 max-w-md text-base leading-relaxed text-pretty sm:text-lg'>
              {t(
                'The administrator has not configured any about content yet. You can set it in the settings page, supporting HTML or URL.'
              )}
            </p>
          </div>

          <div className='border-border divide-border divide-y border-y'>
            {facts.map((fact) => (
              <article
                key={fact.index}
                className='grid grid-cols-[3.5rem_1fr] gap-4 py-8 sm:grid-cols-[5rem_1fr] sm:gap-6 sm:py-10'
              >
                <p className='font-ascii text-landing-accent pt-1 text-sm'>
                  {fact.index}
                </p>
                <div>
                  <h2 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                    {fact.title}
                  </h2>
                  <p className='text-muted-foreground mt-3 max-w-lg text-base leading-relaxed text-pretty'>
                    {fact.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: async () => requireServerSuccess(await getAboutContent()),
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (!hasContent) {
    return (
      <PublicLayout showMainContainer={false}>
        <EmptyAboutState />
        <Footer />
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <section className='px-4 pt-28 pb-24 sm:px-6 lg:pt-32'>
        <div className='mx-auto w-full max-w-4xl'>
          <AboutBanner />
          <article className='border-border mt-10 overflow-hidden rounded-3xl border'>
            <header className='border-border font-ascii text-muted-foreground flex items-center justify-between border-b px-5 py-3 text-xs'>
              <span>about.md</span>
              <span aria-hidden>●●●</span>
            </header>
            <div className='px-5 py-8 sm:px-10 sm:py-12'>
              <RichContent
                mode='markdown'
                content={rawContent}
                className='prose-neutral dark:prose-invert max-w-none'
              />
            </div>
          </article>
        </div>
      </section>
      <Footer />
    </PublicLayout>
  )
}
