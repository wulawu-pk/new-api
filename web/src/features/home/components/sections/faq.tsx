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
import { Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EASE } from '../../constants'

export function Faq() {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const baseId = useId()
  const [open, setOpen] = useState(0)

  const faqs = [
    {
      q: t('Which clients work with this gateway?'),
      a: t(
        'Anything that speaks the OpenAI, Claude or Gemini API: official SDKs, Claude Code, Cherry Studio, LangChain and most chat apps. Set the base URL and use your key.'
      ),
    },
    {
      q: t('Which models can I call?'),
      a: t(
        'Every model listed on the models page. What a key can reach depends on your group and on the limits set on that key.'
      ),
    },
    {
      q: t('How is usage billed?'),
      a: t(
        'Pay as you go. Each request is charged at the model price, per token or per call, and deducted from your balance. The usage log lists every charge.'
      ),
    },
    {
      q: t('Can I restrict a key?'),
      a: t(
        'Yes. Each key can have its own quota, expiry date, model allowlist and allowed IP ranges.'
      ),
    },
    {
      q: t('What happens when an upstream provider fails?'),
      a: t(
        'Operators can put several channels behind one model, and failed requests can be retried on another channel. Your code stays the same.'
      ),
    },
  ]

  return (
    <section
      aria-labelledby='home-faq-heading'
      className='relative z-10 px-4 py-24 sm:px-6 lg:py-28'
    >
      <div className='mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.6fr] lg:gap-20'>
        <div className='flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start'>
          <p className='font-ascii text-muted-foreground text-xs tracking-wide uppercase'>
            [ FAQ ]
          </p>
          <h2
            id='home-faq-heading'
            className='text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl'
          >
            {t('Questions, answered')}
          </h2>
          <p className='text-muted-foreground max-w-sm text-base leading-relaxed'>
            {t('Short answers about keys, models and billing.')}
          </p>
        </div>

        <div className='border-border border-y border-dashed'>
          {faqs.map((faq, index) => {
            const isOpen = open === index
            const panelId = `${baseId}-panel-${index}`
            return (
              <div
                key={faq.q}
                className='border-border border-b border-dashed py-6 last:border-b-0 sm:py-8'
              >
                <h3>
                  <button
                    type='button'
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? -1 : index)}
                    className='group focus-visible:ring-ring flex w-full items-start gap-4 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none sm:gap-6'
                  >
                    <span className='font-ascii text-muted-foreground mt-1.5 w-7 shrink-0 text-[11px] tabular-nums'>
                      Q{index + 1}
                    </span>
                    <span className='flex-1 text-base font-medium sm:text-lg'>
                      {faq.q}
                    </span>
                    <span className='bg-muted group-hover:bg-muted/70 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors'>
                      {isOpen ? (
                        <Minus className='size-4' aria-hidden />
                      ) : (
                        <Plus className='size-4' aria-hidden />
                      )}
                    </span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      role='region'
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                      className='overflow-hidden'
                    >
                      <p className='text-muted-foreground max-w-3xl pt-4 pr-12 pl-11 text-sm leading-relaxed sm:pl-[3.25rem] sm:text-base'>
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
