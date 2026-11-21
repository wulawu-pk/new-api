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
import { ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import AsciiRipple from '@/components/react-bits/ascii-ripple'
import CipherReveal from '@/components/react-bits/cipher-reveal'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { LANDING_COLOR_VARS, landingAction } from '@/features/home/constants'
import { useCssColors } from '@/hooks/use-css-colors'
import { useSystemConfig } from '@/hooks/use-system-config'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getAboutContent } from './api'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const REPO_URL = 'https://github.com/QuantumNous/new-api'

const RIPPLE_TEXT = Array.from(
  { length: 24 },
  () =>
    'one key · every model · openai · claude · gemini · deepseek · qwen · route · balance · bill · observe ·'
).join(' ')

const linkClass =
  'text-foreground decoration-landing-accent/60 hover:decoration-landing-accent underline decoration-1 underline-offset-4 transition-colors duration-200'

/** Interactive ASCII field, framed like a terminal pane. */
function AsciiPane(props: { className?: string }) {
  const colors = useCssColors(LANDING_COLOR_VARS)
  return (
    <div
      aria-hidden
      className={`border-border bg-muted/30 relative overflow-hidden rounded-2xl border ${props.className ?? ''}`}
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
      <span className='font-ascii text-muted-foreground bg-background/85 ring-border absolute bottom-3 left-3 rounded-md px-2 py-1 text-[11px] ring-1 backdrop-blur'>
        ~/about $ cat README
        <span className='ascii-caret'>_</span>
      </span>
    </div>
  )
}

type Chapter = {
  id: string
  marker: ReactNode
  title: string
  detail: ReactNode
  extra?: ReactNode
}

function EmptyAboutState() {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const currentYear = new Date().getFullYear()

  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
  }

  const chapters: Chapter[] = [
    {
      id: 'one-api',
      marker: (
        <>
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
      title: t('One API'),
      detail: t('The open-source API gateway this project is based on.'),
    },
    {
      id: 'new-api',
      marker: (
        <>
          <a
            href={REPO_URL}
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
          </a>
        </>
      ),
      title: t('NewAPI'),
      detail: (
        <>
          {t('New API Project Repository:')}{' '}
          <a
            href={REPO_URL}
            target='_blank'
            rel='noopener noreferrer'
            className={linkClass}
          >
            {t('https://github.com/QuantumNous/new-api')}
          </a>
        </>
      ),
      extra: (
        <>
          <AsciiPane className='mt-6 aspect-[21/9]' />
          <ul className='mt-5 flex flex-wrap gap-2'>
            {['OpenAI', 'Claude', 'Gemini', 'Embeddings', 'Images'].map(
              (chip) => (
                <li
                  key={chip}
                  className='border-border font-ascii rounded-full border px-3.5 py-1 text-xs'
                >
                  {chip}
                </li>
              )
            )}
          </ul>
        </>
      ),
    },
    {
      id: 'license',
      marker: 'AGPL-3.0',
      title: t('License'),
      detail: (
        <>
          {t('This project must be used in compliance with the')}{' '}
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
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
    {
      id: 'this-site',
      marker: '~/about',
      title: t('No About Content Set'),
      detail: t(
        'The administrator has not configured any about content yet. You can set it in the settings page, supporting HTML or URL.'
      ),
    },
  ]

  return (
    <section className='px-4 pt-28 pb-24 sm:px-6 lg:pt-32'>
      <div className='mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20'>
        <motion.div
          initial='hidden'
          animate='visible'
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className='lg:sticky lg:top-28'
        >
          <motion.p
            variants={item}
            className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'
          >
            [ {t('About')} ]
          </motion.p>
          <CipherReveal
            as='h1'
            text={t('Open source, end to end.')}
            trigger='mount'
            align='left'
            fontSize='clamp(2.25rem, 4.6vw, 3.75rem)'
            lineHeight={1.06}
            letterSpacing='-0.03em'
            className='mt-5 text-balance'
          />
          <motion.p
            variants={item}
            className='text-muted-foreground mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg'
          >
            {t(
              'This site runs New API, an open-source AI gateway by QuantumNous built on One API.'
            )}
          </motion.p>
          <motion.div variants={item} className='mt-8'>
            <a
              href={REPO_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={landingAction.secondary}
            >
              {t('View on GitHub')}
              <ArrowUpRight className='size-4' strokeWidth={1.75} aria-hidden />
            </a>
          </motion.div>
        </motion.div>

        <motion.ol
          initial='hidden'
          animate='visible'
          variants={{ visible: { transition: { staggerChildren: 0.14 } } }}
          className='relative'
        >
          <motion.span
            aria-hidden
            variants={{
              hidden: { scaleY: reduce ? 1 : 0 },
              visible: { scaleY: 1, transition: { duration: 1.1, ease: EASE } },
            }}
            className='bg-border absolute top-1.5 bottom-1.5 left-[5px] w-px origin-top'
          />
          {chapters.map((chapter, index) => (
            <motion.li
              key={chapter.id}
              variants={item}
              className='relative pb-14 pl-10 last:pb-0 sm:pb-16 sm:pl-14'
            >
              <span
                aria-hidden
                className='bg-foreground ring-background absolute top-0.5 left-0 size-[11px] rounded-full ring-4'
              />
              <p className='font-ascii text-muted-foreground text-xs tracking-[0.12em] uppercase'>
                <span className='text-landing-accent'>
                  {String(index + 1).padStart(2, '0')}
                </span>{' '}
                · {chapter.marker}
              </p>
              <h2 className='mt-3 text-xl font-semibold tracking-tight sm:text-2xl'>
                {chapter.title}
              </h2>
              <p className='text-muted-foreground mt-3 max-w-xl text-base leading-relaxed text-pretty'>
                {chapter.detail}
              </p>
              {chapter.extra}
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}

/** Administrator-written markdown beside a sticky identity column. */
function MarkdownAbout(props: { content: string }) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()

  return (
    <section className='px-4 pt-28 pb-24 sm:px-6 lg:pt-32'>
      <div className='mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16'>
        <aside className='flex flex-col gap-6 lg:sticky lg:top-28'>
          <div>
            <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
              [ {t('About')} ]
            </p>
            <h1 className='mt-4 text-[clamp(2rem,4vw,3rem)] leading-[1.08] font-semibold tracking-tight text-balance'>
              {systemName || t('About')}
            </h1>
          </div>
          <AsciiPane className='hidden aspect-[4/3] lg:block' />
        </aside>
        <article className='border-border overflow-hidden rounded-3xl border'>
          <header className='border-border font-ascii text-muted-foreground flex items-center justify-between border-b px-5 py-3 text-xs'>
            <span>about.md</span>
            <span aria-hidden>●●●</span>
          </header>
          <div className='px-5 py-8 sm:px-10 sm:py-12'>
            <RichContent
              mode='markdown'
              content={props.content}
              className='prose-neutral dark:prose-invert max-w-none'
            />
          </div>
        </article>
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
      <MarkdownAbout content={rawContent} />
      <Footer />
    </PublicLayout>
  )
}
