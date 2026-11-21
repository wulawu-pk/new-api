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
import { Claude, Gemini, OpenAI } from '@lobehub/icons'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { EASE } from '../../constants'

const KEYWORDS = /^(import|from|const|new|await|curl|-H|-d)$/

/** Light-weight highlighting: strings take the accent, keywords recede. */
function highlight(line: string) {
  const nodes: ReactNode[] = []
  let offset = 0
  for (const part of line.split(/("[^"]*"|'[^']*'|\s+|[{}()[\],.:=])/)) {
    if (!part) continue
    let tone = 'text-foreground'
    if (/^["']/.test(part)) {
      tone = 'text-landing-accent'
    } else if (KEYWORDS.test(part) || /^[{}()[\],.:=]$/.test(part)) {
      tone = 'text-muted-foreground'
    }
    nodes.push(
      <span key={offset} className={tone}>
        {part}
      </span>
    )
    offset += part.length
  }
  return nodes
}

export function Protocols() {
  const { t } = useTranslation()
  const reduce = useReducedMotion()

  const snippets = useMemo(() => {
    const origin = window.location.origin
    return [
      {
        id: 'openai',
        label: 'OpenAI SDK',
        lines: [
          'from openai import OpenAI',
          '',
          'client = OpenAI(',
          `    base_url="${origin}/v1",`,
          '    api_key="sk-your-key",',
          ')',
          '',
          'reply = client.chat.completions.create(',
          '    model="claude-sonnet-4-5",',
          '    messages=[{"role": "user", "content": "Hello"}],',
          ')',
        ],
      },
      {
        id: 'anthropic',
        label: 'Anthropic SDK',
        lines: [
          'import Anthropic from "@anthropic-ai/sdk";',
          '',
          'const client = new Anthropic({',
          `  baseURL: "${origin}",`,
          '  apiKey: "sk-your-key",',
          '});',
          '',
          'const msg = await client.messages.create({',
          '  model: "claude-sonnet-4-5",',
          '  max_tokens: 1024,',
          '  messages: [{ role: "user", content: "Hello" }],',
          '});',
        ],
      },
      {
        id: 'gemini',
        label: 'Gemini',
        lines: [
          `curl "${origin}/v1beta/models/gemini-2.5-pro:generateContent" \\`,
          '  -H "x-goog-api-key: sk-your-key" \\',
          '  -H "Content-Type: application/json" \\',
          `  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'`,
        ],
      },
    ].map((snippet) => ({
      ...snippet,
      numbered: snippet.lines.map((text, i) => ({ number: i + 1, text })),
    }))
  }, [])

  const surfaces = [
    {
      icon: <OpenAI size={20} />,
      title: t('OpenAI compatible'),
      body: t('Chat Completions, Responses, embeddings and images under /v1.'),
    },
    {
      icon: <Claude.Color size={20} />,
      title: t('Claude Messages'),
      body: t('Native /v1/messages for Claude Code and the Anthropic SDKs.'),
    },
    {
      icon: <Gemini.Color size={20} />,
      title: t('Gemini native'),
      body: t('generateContent routes under /v1beta for Gemini clients.'),
    },
  ]

  const reveal = (index: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.6, ease: EASE, delay: index * 0.06 },
  })

  return (
    <section
      aria-labelledby='home-protocols-heading'
      className='relative z-10 px-4 py-24 sm:px-6 lg:py-32'
    >
      <div className='mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-12 lg:gap-x-8'>
        <motion.div {...reveal(0)} className='flex flex-col lg:col-span-5'>
          <p className='font-ascii text-landing-accent text-xs'>
            $ export OPENAI_BASE_URL
          </p>
          <h2
            id='home-protocols-heading'
            className='mt-4 text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl'
          >
            {t('Same key. Any protocol.')}
          </h2>
          <p className='text-muted-foreground mt-5 max-w-md text-base leading-relaxed text-pretty sm:text-lg'>
            {t(
              'Keep the SDK you already ship. Point it at this gateway and switch models by changing one string.'
            )}
          </p>
          <ul className='mt-10 flex flex-col gap-2'>
            {surfaces.map((surface) => (
              <li
                key={surface.title}
                className='bg-muted/50 flex gap-4 rounded-2xl p-5'
              >
                <span className='mt-0.5 shrink-0' aria-hidden>
                  {surface.icon}
                </span>
                <div className='min-w-0'>
                  <h3 className='text-base font-semibold tracking-tight sm:text-lg'>
                    {surface.title}
                  </h3>
                  <p className='text-muted-foreground mt-1 text-sm leading-relaxed text-pretty sm:text-base'>
                    {surface.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...reveal(1)}
          className='min-w-0 lg:col-span-6 lg:col-start-7'
        >
          <Tabs
            defaultValue={snippets[0].id}
            className='border-border bg-background flex flex-col gap-0 overflow-hidden rounded-2xl border shadow-[0_40px_80px_-40px_rgba(0,0,0,0.35)]'
          >
            <div className='border-border flex items-center justify-between gap-3 border-b px-3 py-2'>
              <TabsList variant='line' className='h-9'>
                {snippets.map((snippet) => (
                  <TabsTrigger
                    key={snippet.id}
                    value={snippet.id}
                    className='font-ascii px-3 text-xs'
                  >
                    {snippet.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {snippets.map((snippet) => (
              <TabsContent
                key={snippet.id}
                value={snippet.id}
                className='relative'
              >
                <pre className='font-ascii min-h-[21rem] overflow-x-auto px-4 py-5 text-[13px] leading-6'>
                  <code className='block'>
                    {snippet.numbered.map((line) => (
                      <span key={line.number} className='flex'>
                        <span
                          aria-hidden
                          className='text-muted-foreground/50 hidden w-9 shrink-0 pr-4 text-right tabular-nums select-none sm:block'
                        >
                          {line.number}
                        </span>
                        <span className='pr-12 whitespace-pre'>
                          {line.text ? highlight(line.text) : ' '}
                        </span>
                      </span>
                    ))}
                  </code>
                </pre>
                <CopyButton
                  value={snippet.lines.join('\n')}
                  className='absolute top-3 right-3'
                />
              </TabsContent>
            ))}
            <div className='border-border bg-muted/40 font-ascii border-t px-5 py-4 text-[12px] leading-6'>
              <p className='text-muted-foreground'>
                <span className='text-landing-accent'>200</span> · one key · one
                base URL
              </p>
              <p className='text-muted-foreground truncate'>
                {
                  '{ "model": "claude-sonnet-4-5", "content": "Hello! How can I help?" }'
                }
              </p>
            </div>
          </Tabs>
        </motion.div>
      </div>
    </section>
  )
}
