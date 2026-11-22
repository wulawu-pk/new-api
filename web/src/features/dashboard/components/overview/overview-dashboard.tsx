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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  FileText,
  KeyRound,
  RadioTower,
  ShieldCheck,
  TerminalSquare,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import type { TerminalStep } from '@/components/react-bits/terminal-replay'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LANDING_COLOR_VARS } from '@/features/home/constants'
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useCssColors } from '@/hooks/use-css-colors'
import { getUserModels } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { DASHBOARD_EYEBROW, DASHBOARD_FRAME } from '../../constants'
import {
  useApiInfo,
  useDashboardContentVisibility,
} from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { FAQPanel } from './faq-panel'
import { OverviewHero } from './overview-hero'
import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'
import { UptimePanel } from './uptime-panel'

const TerminalReplay = lazy(
  () => import('@/components/react-bits/terminal-replay')
)

const TERMINAL_HEIGHT = 196

const SETUP_GUIDE_VISIBILITY_STORAGE_KEY =
  'dashboard_overview_setup_guide_expanded'

type DashboardActionPath =
  | '/keys'
  | '/wallet'
  | '/playground'
  | '/channels'
  | '/usage-logs'
  | '/pricing'

interface StartStep {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  completed: boolean
}

interface QuickAction {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  adminOnly?: boolean
}

interface RequestExample {
  endpoint: string
  /** OpenAI-compatible base URL (`…/v1`) behind `endpoint`. */
  baseUrl: string
  model: string
  keyName: string
  keyId?: number
  displayKey: string
  ready: boolean
}

interface HeroSignal {
  label: string
  value: string
  icon: LucideIcon
}

function getSavedSetupGuideExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  const saved = window.localStorage.getItem(SETUP_GUIDE_VISIBILITY_STORAGE_KEY)
  if (saved === 'expanded') return true
  if (saved === 'collapsed') return false
  return null
}

function saveSetupGuideExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    SETUP_GUIDE_VISIBILITY_STORAGE_KEY,
    expanded ? 'expanded' : 'collapsed'
  )
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function normalizeEndpoint(sourceUrl?: string): string {
  const fallback = `${getCurrentOrigin()}/v1/chat/completions`
  const trimmed = sourceUrl?.trim()
  if (!trimmed) return fallback

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlash.endsWith('/v1/chat/completions')) {
    return withoutTrailingSlash
  }
  if (withoutTrailingSlash.endsWith('/v1')) {
    return `${withoutTrailingSlash}/chat/completions`
  }
  return `${withoutTrailingSlash}/v1/chat/completions`
}

function getPreferredKey(keys: ApiKey[]): ApiKey | null {
  return keys.find((item) => item.status === 1) ?? keys[0] ?? null
}

function formatDisplayKey(key?: string): string {
  if (!key) return 'sk-...'
  if (key.length <= 14) return key
  return `${key.slice(0, 7)}...${key.slice(-4)}`
}

function buildCurlCommand(args: {
  endpoint: string
  apiKey: string
  model: string
}): string {
  return [
    `curl ${args.endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${args.apiKey}" \\`,
    `  -d '{"model":"${args.model}","messages":[{"role":"user","content":"Say hello in one sentence."}]}'`,
  ].join('\n')
}

/**
 * Replayed in the setup guide with the masked key. The copy button fetches
 * the real key on demand, so the full secret never sits in the page.
 */
function requestSession(example: RequestExample): TerminalStep[] {
  return [
    { type: 'command', text: `export OPENAI_BASE_URL=${example.baseUrl}` },
    { type: 'command', text: `export OPENAI_API_KEY=${example.displayKey}` },
    {
      type: 'command',
      text: `curl $OPENAI_BASE_URL/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" -d '{"model":"${example.model}"}'`,
    },
    { type: 'output', lines: ['', `[accent]●[/] [muted]${example.model}[/]`] },
  ]
}

function StartStepItem(props: { step: StartStep; index: number }) {
  const Icon = props.step.icon

  return (
    <li>
      <Link
        to={props.step.to}
        className='group hover:bg-muted/40 focus-visible:ring-ring flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5'
      >
        <span className='font-ascii text-muted-foreground w-6 shrink-0 text-xs tabular-nums'>
          {String(props.index + 1).padStart(2, '0')}
        </span>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border',
            props.step.completed
              ? 'border-landing-accent/40 bg-landing-accent-soft text-landing-accent'
              : 'border-border bg-background text-muted-foreground'
          )}
        >
          {props.step.completed ? (
            <Check className='size-4' aria-hidden='true' />
          ) : (
            <Icon className='size-3.5' aria-hidden='true' />
          )}
        </span>
        <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span
            className={cn(
              'truncate text-sm font-medium',
              props.step.completed && 'text-muted-foreground line-through'
            )}
          >
            {props.step.title}
          </span>
          <span className='text-muted-foreground line-clamp-1 text-xs'>
            {props.step.description}
          </span>
        </span>
        <ArrowRight
          className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5'
          aria-hidden='true'
        />
      </Link>
    </li>
  )
}

function RequestPreview(props: {
  example: RequestExample
  signals: HeroSignal[]
}) {
  const { t } = useTranslation()
  const colors = useCssColors(LANDING_COLOR_VARS)
  const [isCopying, setIsCopying] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const script = useMemo(() => requestSession(props.example), [props.example])
  const handleCopyRequest = async () => {
    if (!props.example.keyId || isCopying) return

    setIsCopying(true)
    try {
      const result = await fetchTokenKey(props.example.keyId)
      const key = result.success && result.data?.key ? result.data.key : ''
      if (!key) {
        handleServerError(result, t('Failed to copy to clipboard'))
        return
      }

      const realCurl = buildCurlCommand({
        endpoint: props.example.endpoint,
        apiKey: `sk-${key}`,
        model: props.example.model,
      })
      const copied = await copyToClipboard(realCurl)
      if (copied) {
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className='border-border bg-background/80 flex min-w-0 flex-col gap-3 rounded-2xl border p-3 backdrop-blur'>
      <div className='flex items-center justify-between gap-3 px-1'>
        <div className='flex min-w-0 items-center gap-2'>
          <TerminalSquare
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>
              {t('First API request')}
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {props.example.ready
                ? props.example.keyName
                : t('Create an API key to unlock the real request')}
            </div>
          </div>
        </div>
        {props.example.ready ? (
          <Button
            variant='outline'
            size='sm'
            className='h-8 gap-1.5 rounded-full px-3 text-xs'
            disabled={isCopying}
            onClick={handleCopyRequest}
            aria-label={t('Copy ready-to-run curl')}
          >
            <Copy data-icon='inline-start' />
            {isCopying ? t('Loading') : t('Copy')}
          </Button>
        ) : (
          <Button
            size='sm'
            variant='outline'
            className='h-8 rounded-full px-3'
            render={<Link to='/keys' />}
          >
            {t('Create API Key')}
          </Button>
        )}
      </div>

      <Suspense
        fallback={
          <Skeleton
            className='rounded-xl'
            style={{ height: TERMINAL_HEIGHT }}
          />
        }
      >
        <TerminalReplay
          script={script}
          title='~/gateway'
          chrome='window'
          dots='mono'
          theme='auto'
          accentColor={colors.accent}
          fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
          fontSize={12}
          height={TERMINAL_HEIGHT}
          radius={12}
          typingSpeed={42}
          hold={5200}
          loop
          copyable={false}
        />
      </Suspense>

      <dl className='divide-border grid divide-y px-1'>
        {props.signals.map((signal) => {
          const Icon = signal.icon

          return (
            <div
              key={signal.label}
              className='flex items-center justify-between gap-3 py-2'
            >
              <dt className='text-muted-foreground flex min-w-0 items-center gap-2 text-xs'>
                <Icon className='size-3.5 shrink-0' aria-hidden='true' />
                <span className='truncate'>{signal.label}</span>
              </dt>
              <dd className='font-ascii truncate text-xs'>{signal.value}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function QuickActionItem(props: { action: QuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='ghost'
      className='group hover:bg-muted/50 h-auto justify-start gap-3 rounded-2xl px-3 py-3 text-left'
      render={<Link to={props.action.to} />}
    >
      <span className='border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-full border'>
        <Icon className='size-4' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate text-sm font-medium'>
          {props.action.title}
        </span>
        <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed font-normal'>
          {props.action.description}
        </span>
      </span>
      <ArrowRight
        className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5'
        aria-hidden='true'
      />
    </Button>
  )
}

function CompactQuickAction(props: { action: QuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='outline'
      size='sm'
      className='bg-background/70 h-8 gap-1.5 rounded-full px-3'
      render={<Link to={props.action.to} />}
    >
      <Icon data-icon='inline-start' />
      <span>{props.action.title}</span>
    </Button>
  )
}

export function OverviewDashboard() {
  const { t } = useTranslation()
  const setupGuideId = useId()
  const setupGuideToggleRef = useRef<HTMLButtonElement>(null)
  const user = useAuthStore((state) => state.auth.user)
  const { items: apiInfoItems } = useApiInfo()
  const {
    apiInfo: showApiInfoPanel,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()
  const [manualSetupGuideExpanded, setManualSetupGuideExpanded] = useState<
    boolean | null
  >(() => getSavedSetupGuideExpanded())

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () => {
      const result = requireServerSuccess(await getApiKeys({ p: 1, size: 10 }))
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })

  const modelsQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'user-models'],
    queryFn: async () => {
      const result = requireServerSuccess(await getUserModels())
      return result.success ? (result.data ?? []) : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const preferredKey = useMemo(
    () => getPreferredKey(apiKeysQuery.data ?? []),
    [apiKeysQuery.data]
  )

  const startSteps = useMemo<StartStep[]>(
    () => [
      {
        title: t('Create API Key'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
        completed: Boolean(preferredKey),
      },
      {
        title: t('Add credits'),
        description: t('Keep enough balance before production traffic'),
        to: '/wallet',
        icon: CreditCard,
        completed: remainQuota > 0 || usedQuota > 0,
      },
      {
        title: t('Send a request'),
        description: t('Verify routing with Playground or your client'),
        to: '/playground',
        icon: TerminalSquare,
        completed: requestCount > 0,
      },
    ],
    [preferredKey, remainQuota, requestCount, t, usedQuota]
  )

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        title: t('API Keys'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
      },
      {
        title: t('Channels'),
        description: t('Configure upstream providers and routing.'),
        to: '/channels',
        icon: RadioTower,
        adminOnly: true,
      },
      {
        title: t('Usage Logs'),
        description: t('Inspect requests, errors, and billing details'),
        to: '/usage-logs',
        icon: FileText,
      },
      {
        title: t('Pricing'),
        description: t('Review model rates before scaling traffic'),
        to: '/pricing',
        icon: BookOpen,
      },
    ],
    [t]
  )

  const visibleQuickActions = useMemo(
    () => quickActions.filter((action) => !action.adminOnly || isAdmin),
    [isAdmin, quickActions]
  )

  const heroSignals = useMemo<HeroSignal[]>(
    () => [
      {
        label: t('Route active'),
        value: apiInfoItems.length > 0 ? t('Online') : t('Current domain'),
        icon: RadioTower,
      },
      {
        label: t('Auth configured'),
        value: preferredKey ? t('Secured') : t('Needs API key'),
        icon: ShieldCheck,
      },
      {
        label: t('Model selected'),
        value: modelsQuery.data?.[0] ?? t('Loading'),
        icon: Timer,
      },
    ],
    [apiInfoItems.length, modelsQuery.data, preferredKey, t]
  )

  const requestExample = useMemo<RequestExample>(() => {
    const endpoint = normalizeEndpoint(apiInfoItems[0]?.url)
    const model = modelsQuery.data?.[0] ?? 'gpt-4o-mini'
    const keyName = preferredKey?.name ?? t('No API key yet')
    const ready = Boolean(preferredKey?.id && model)

    return {
      endpoint,
      baseUrl: endpoint.replace(/\/chat\/completions$/, ''),
      model,
      keyName,
      keyId: preferredKey?.id,
      displayKey: preferredKey
        ? formatDisplayKey(`sk-${preferredKey.key}`)
        : 'sk-...',
      ready,
    }
  }, [apiInfoItems, modelsQuery.data, preferredKey, t])

  const completedStepCount = startSteps.filter((step) => step.completed).length
  const setupComplete = completedStepCount === startSteps.length
  const setupStatusReady = apiKeysQuery.isFetched && Boolean(user)
  const setupGuideExpanded =
    manualSetupGuideExpanded ?? (setupStatusReady && !setupComplete)
  const showLeftContentPanels =
    isAdmin || showApiInfoPanel || showAnnouncementsPanel || showFAQPanel
  const showContentPanels = showLeftContentPanels || showUptimePanel

  const handleSetupGuideToggle = () => {
    const nextExpanded = !setupGuideExpanded
    setManualSetupGuideExpanded(nextExpanded)
    saveSetupGuideExpanded(nextExpanded)
    if (!nextExpanded && setupComplete) {
      setupGuideToggleRef.current?.focus()
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Overview')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {setupStatusReady && setupComplete && (
          <Button
            ref={setupGuideToggleRef}
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground h-auto min-h-7 max-w-[60vw] whitespace-normal'
            aria-expanded={setupGuideExpanded}
            aria-controls={setupGuideId}
            onClick={handleSetupGuideToggle}
          >
            {t('Setup guide')}
          </Button>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <OverviewHero
            username={user?.username ?? ''}
            displayName={user?.display_name || user?.username || ''}
            baseUrl={requestExample.baseUrl}
            modelCount={modelsQuery.data?.length}
          />
          <div id={setupGuideId} hidden={!setupGuideExpanded}>
            {setupGuideExpanded && (
              <CardStaggerContainer className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
                <CardStaggerItem className={cn(DASHBOARD_FRAME, 'h-full')}>
                  <div className='grid h-full gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_23rem]'>
                    <div className='flex min-w-0 flex-col gap-5'>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div className='flex max-w-2xl flex-col gap-1.5'>
                          <p aria-hidden className={DASHBOARD_EYEBROW}>
                            [ {t('Get started')} ]
                          </p>
                          <h3 className='text-xl font-semibold tracking-tight text-balance sm:text-2xl'>
                            {t('Build on your API gateway in minutes')}
                          </h3>
                          <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
                            {t(
                              'A focused home for keys, balance, routing, and service health.'
                            )}
                          </p>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-9 rounded-full px-4'
                            aria-expanded={setupGuideExpanded}
                            aria-controls={setupGuideId}
                            onClick={handleSetupGuideToggle}
                          >
                            <ChevronUp data-icon='inline-start' />
                            {t('Hide setup guide')}
                          </Button>
                          <Button
                            size='sm'
                            className='bg-foreground text-background hover:bg-foreground/85 h-9 rounded-full px-4'
                            render={<Link to='/keys' />}
                          >
                            <KeyRound data-icon='inline-start' />
                            {t('Create API Key')}
                          </Button>
                        </div>
                      </div>

                      <div className='border-border overflow-hidden rounded-2xl border'>
                        <div className='flex items-center gap-3 px-4 py-3 sm:px-5'>
                          <span className='font-ascii text-muted-foreground shrink-0 text-xs tabular-nums'>
                            {completedStepCount}/{startSteps.length}
                          </span>
                          <div
                            role='progressbar'
                            aria-label={t('Setup progress')}
                            aria-valuemin={0}
                            aria-valuemax={startSteps.length}
                            aria-valuenow={completedStepCount}
                            className='bg-muted h-1 flex-1 overflow-hidden rounded-full'
                          >
                            <div
                              className='bg-landing-accent h-full rounded-full transition-[width] duration-500'
                              style={{
                                width: `${(completedStepCount / startSteps.length) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <ol className='divide-border border-border divide-y border-t'>
                          {startSteps.map((step, index) => (
                            <StartStepItem
                              key={step.title}
                              step={step}
                              index={index}
                            />
                          ))}
                        </ol>
                      </div>
                    </div>

                    <RequestPreview
                      example={requestExample}
                      signals={heroSignals}
                    />
                  </div>
                </CardStaggerItem>

                <CardStaggerItem className={cn(DASHBOARD_FRAME, 'h-full p-3')}>
                  <div className='flex h-full flex-col gap-3'>
                    <div className='flex flex-col gap-1.5 px-2 pt-2'>
                      <p aria-hidden className={DASHBOARD_EYEBROW}>
                        [ {t('Recommended actions')} ]
                      </p>
                      <h3 className='text-lg font-semibold tracking-tight'>
                        {t('Keep the platform ready')}
                      </h3>
                    </div>
                    <div className='grid gap-1'>
                      {visibleQuickActions.map((action) => (
                        <QuickActionItem key={action.title} action={action} />
                      ))}
                    </div>
                  </div>
                </CardStaggerItem>
              </CardStaggerContainer>
            )}
          </div>
          {!setupGuideExpanded && !setupComplete && (
            <CardStaggerContainer>
              <CardStaggerItem className={DASHBOARD_FRAME}>
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5'>
                  <div className='flex min-w-0 items-center gap-3'>
                    <span className='border-landing-accent/40 bg-landing-accent-soft text-landing-accent flex size-9 shrink-0 items-center justify-center rounded-full border'>
                      <Check className='size-4' aria-hidden='true' />
                    </span>
                    <div className='min-w-0'>
                      <div className='flex items-center gap-2'>
                        <h3 className='truncate text-sm font-semibold'>
                          {t('Setup guide')}
                        </h3>
                        <span className='font-ascii text-muted-foreground border-border rounded-full border px-2 py-0.5 text-[11px]'>
                          {t('Setup progress: {{completed}}/{{total}}', {
                            completed: completedStepCount,
                            total: startSteps.length,
                          })}
                        </span>
                      </div>
                      <p className='text-muted-foreground line-clamp-1 text-xs'>
                        {t('Setup guide is collapsed. Expand it anytime.')}
                      </p>
                    </div>
                  </div>

                  <div className='flex flex-wrap items-center gap-2'>
                    {visibleQuickActions.map((action) => (
                      <CompactQuickAction key={action.title} action={action} />
                    ))}
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 rounded-full px-3'
                      aria-expanded={setupGuideExpanded}
                      aria-controls={setupGuideId}
                      onClick={handleSetupGuideToggle}
                    >
                      <ChevronDown data-icon='inline-start' />
                      {t('Show setup guide')}
                    </Button>
                  </div>
                </div>
              </CardStaggerItem>
            </CardStaggerContainer>
          )}

          <SummaryCards />

          {showContentPanels && (
            <CardStaggerContainer
              className={cn(
                'grid grid-cols-1 gap-4',
                showLeftContentPanels &&
                  showUptimePanel &&
                  'xl:grid-cols-[minmax(0,1fr)_22rem]'
              )}
            >
              {showLeftContentPanels && (
                <div
                  className={cn(
                    'grid min-w-0 grid-cols-1 gap-4',
                    (showApiInfoPanel ||
                      showAnnouncementsPanel ||
                      showFAQPanel) &&
                      'lg:grid-cols-2'
                  )}
                >
                  {isAdmin && (
                    <CardStaggerItem className='lg:col-span-2'>
                      <PerformanceHealthPanel />
                    </CardStaggerItem>
                  )}
                  {showApiInfoPanel && (
                    <CardStaggerItem>
                      <ApiInfoPanel />
                    </CardStaggerItem>
                  )}
                  {showAnnouncementsPanel && (
                    <CardStaggerItem>
                      <AnnouncementsPanel />
                    </CardStaggerItem>
                  )}
                  {showFAQPanel && (
                    <CardStaggerItem>
                      <FAQPanel />
                    </CardStaggerItem>
                  )}
                </div>
              )}
              {showUptimePanel && (
                <CardStaggerItem>
                  <UptimePanel />
                </CardStaggerItem>
              )}
            </CardStaggerContainer>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
