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
import { useTranslation } from 'react-i18next'

import { PasswordInput } from '@/components/password-input'
import { Pane } from '@/components/terminal/pane'
import {
  TERM_BUTTON_PRIMARY,
  TERM_INPUT,
  TERM_PASSWORD,
} from '@/components/terminal/styles'
import { TermSelect } from '@/components/terminal/term-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NOTIFICATION_METHODS } from '@/features/profile/constants'
import { useNotificationSettings } from '@/features/profile/hooks/use-notification-settings'
import type { NotifyType, UserProfile } from '@/features/profile/types'
import { useStatus } from '@/hooks/use-status'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, quotaUnitsToDollars } from '@/lib/format'

const LABEL = 'text-t-fg2 text-[13px] font-normal'
const HINT = 'text-t-dim m-0 text-[12.5px] leading-[1.6]'

/** A labelled text field with an optional hint under it. */
function Field(props: {
  id: string
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-[7px]'>
      <Label htmlFor={props.id} className={LABEL}>
        {props.label}
      </Label>
      {props.children}
      {props.hint != null && <p className={HINT}>{props.hint}</p>}
    </div>
  )
}

/** A switch with its label and one line on what it does. */
function SwitchRow(props: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className='border-t-line flex items-start justify-between gap-4 py-3 [&+&]:border-t'>
      <div className='min-w-0'>
        <Label htmlFor={props.id} className='text-t-fg text-sm font-normal'>
          {props.label}
        </Label>
        <p className={HINT}>{props.description}</p>
      </div>
      <Switch
        id={props.id}
        className='mt-0.5 shrink-0'
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  )
}

type NotifyPaneProps = {
  profile: UserProfile
  onUpdate: () => void
}

/**
 * Where notifications go and which ones to get, plus the unpriced-model
 * preference; all saved together, like the old settings card (same hook).
 */
export function NotifyPane(props: NotifyPaneProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const form = useNotificationSettings(props.profile, props.onUpdate)
  const settings = form.settings
  const update = form.updateField
  // Older cached status payloads lack these fields; the site default is on.
  const remindEnabled = status?.quota_remind_enabled !== false
  const remindThreshold = status?.quota_remind_threshold ?? 0
  const showNotifications = remindEnabled || form.isAdmin
  const tokensOnly = getCurrencyDisplay().meta.kind === 'tokens'

  return (
    <Pane title={<b>{t('Notifications & preferences')}</b>}>
      <form
        noValidate
        className='flex flex-col gap-4 px-5 pt-6 pb-5'
        onSubmit={(event) => {
          event.preventDefault()
          void form.save()
        }}
      >
        {!showNotifications && (
          <p className='text-t-dim m-0 text-sm'>
            {t('No notifications are available to you right now')}
          </p>
        )}

        {showNotifications && (
          <>
            <Field id='console-notify-type' label={t('Notification Method')}>
              <TermSelect
                id='console-notify-type'
                value={settings.notify_type}
                options={NOTIFICATION_METHODS.map((method) => ({
                  value: method.value,
                  label: t(method.label),
                }))}
                onValueChange={(value) =>
                  update('notify_type', value as NotifyType)
                }
              />
            </Field>

            {settings.notify_type === 'email' && (
              <Field
                id='console-notify-email'
                label={t('Notification Email')}
                hint={t('Leave empty to use account email')}
              >
                <Input
                  id='console-notify-email'
                  type='email'
                  value={settings.notification_email}
                  onChange={(e) => update('notification_email', e.target.value)}
                  placeholder={props.profile.email || 'you@example.com'}
                  className={TERM_INPUT}
                />
              </Field>
            )}

            {settings.notify_type === 'webhook' && (
              <>
                <Field id='console-webhook-url' label={t('Webhook URL')}>
                  <Input
                    id='console-webhook-url'
                    type='url'
                    value={settings.webhook_url}
                    onChange={(e) => update('webhook_url', e.target.value)}
                    placeholder='https://example.com/webhook'
                    className={`${TERM_INPUT} font-mono`}
                  />
                </Field>
                <Field id='console-webhook-secret' label={t('Webhook Secret')}>
                  <PasswordInput
                    id='console-webhook-secret'
                    value={settings.webhook_secret}
                    onChange={(e) => update('webhook_secret', e.target.value)}
                    placeholder={t('Enter secret key')}
                    className={TERM_PASSWORD}
                  />
                </Field>
              </>
            )}

            {settings.notify_type === 'bark' && (
              <Field
                id='console-bark-url'
                label={t('Bark Push URL')}
                hint={
                  <>
                    {t('Template variables:')} {'{{title}}'}, {'{{content}}'}
                  </>
                }
              >
                <Input
                  id='console-bark-url'
                  type='url'
                  value={settings.bark_url}
                  onChange={(e) => update('bark_url', e.target.value)}
                  placeholder='https://api.day.app/yourkey/{{title}}/{{content}}'
                  className={`${TERM_INPUT} font-mono`}
                />
              </Field>
            )}

            {settings.notify_type === 'gotify' && (
              <>
                <Field
                  id='console-gotify-url'
                  label={t('Gotify Server URL')}
                  hint={t('Enter the full URL of your Gotify server')}
                >
                  <Input
                    id='console-gotify-url'
                    type='url'
                    value={settings.gotify_url}
                    onChange={(e) => update('gotify_url', e.target.value)}
                    placeholder='https://gotify.example.com'
                    className={`${TERM_INPUT} font-mono`}
                  />
                </Field>
                <Field
                  id='console-gotify-token'
                  label={t('Gotify Application Token')}
                  hint={t('Token obtained from your Gotify application')}
                >
                  <PasswordInput
                    id='console-gotify-token'
                    value={settings.gotify_token}
                    onChange={(e) => update('gotify_token', e.target.value)}
                    placeholder={t('Enter application token')}
                    className={TERM_PASSWORD}
                  />
                </Field>
                <Field
                  id='console-gotify-priority'
                  label={t('Message Priority')}
                  hint={t(
                    'Priority level from 0 (lowest) to 10 (highest), default is 5'
                  )}
                >
                  <Input
                    id='console-gotify-priority'
                    type='number'
                    min={0}
                    max={10}
                    value={settings.gotify_priority}
                    onChange={(e) =>
                      update('gotify_priority', Number(e.target.value))
                    }
                    className={`${TERM_INPUT} font-mono`}
                  />
                </Field>
              </>
            )}
          </>
        )}

        <div className='border-t-faint border-t border-dashed pt-1'>
          {remindEnabled && (
            <SwitchRow
              id='console-quota-warning'
              label={t('Low balance reminder')}
              description={t(
                'Remind me once when my balance drops below the threshold'
              )}
              checked={form.quotaWarningEnabled}
              onCheckedChange={(checked) =>
                update('quota_warning_enabled', checked)
              }
            />
          )}
          {remindEnabled && form.quotaWarningEnabled && (
            <div className='pb-3'>
              <Field
                id='console-quota-threshold'
                label={`${t('Reminder threshold')} (${getCurrencyLabel()})`}
                hint={t('Leave empty to use the site default ({{amount}})', {
                  amount: formatQuota(remindThreshold),
                })}
              >
                <Input
                  id='console-quota-threshold'
                  type='number'
                  min={0}
                  step={tokensOnly ? 1 : 0.000001}
                  value={form.thresholdInput}
                  onChange={(e) => form.changeThreshold(e.target.value)}
                  placeholder={String(quotaUnitsToDollars(remindThreshold))}
                  className={`${TERM_INPUT} font-mono`}
                />
              </Field>
            </div>
          )}
          {form.isAdmin && (
            <>
              <SwitchRow
                id='console-channel-notify'
                label={t('Channel notifications')}
                description={t(
                  'When a channel is disabled or re-enabled automatically, or a test of all channels finishes'
                )}
                checked={form.channelNotifyEnabled}
                onCheckedChange={(checked) =>
                  update('channel_notify_enabled', checked)
                }
              />
              <SwitchRow
                id='console-upstream-notify'
                label={t('Upstream Model Updates')}
                description={t(
                  'Only available for admins. When enabled, you will receive a summary notification via your selected method when the scheduled model check detects upstream model changes or check failures.'
                )}
                checked={settings.upstream_model_update_notify_enabled}
                onCheckedChange={(checked) =>
                  update('upstream_model_update_notify_enabled', checked)
                }
              />
            </>
          )}
          <SwitchRow
            id='console-unpriced'
            label={t('Accept Unpriced Models')}
            description={t('Allow using models without price configuration')}
            checked={settings.accept_unset_model_ratio_model}
            onCheckedChange={(checked) =>
              update('accept_unset_model_ratio_model', checked)
            }
          />
        </div>

        <div className='flex flex-wrap gap-2.5'>
          <Button
            type='submit'
            className={TERM_BUTTON_PRIMARY}
            disabled={form.saving}
          >
            {form.saving ? t('Saving...') : t('Save')}
          </Button>
        </div>
      </form>
    </Pane>
  )
}
