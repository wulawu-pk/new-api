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
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SkeletonText } from '@/components/terminal/data-states'
import { Pane } from '@/components/terminal/pane'
import { Button } from '@/components/ui/button'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { TwoFABackupDialog } from '@/features/security/components/dialogs/two-fa-backup-dialog'
import { TwoFADisableDialog } from '@/features/security/components/dialogs/two-fa-disable-dialog'
import { TwoFASetupDialog } from '@/features/security/components/dialogs/two-fa-setup-dialog'
import { usePasskeyActions } from '@/features/security/hooks/use-passkey-actions'
import { useTwoFA } from '@/features/security/hooks/use-two-fa'
import { useTwoFASetup } from '@/features/security/hooks/use-two-fa-setup'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative } from '@/lib/format'

import {
  AccountRow,
  OnOffText,
  ROW_BUTTON,
  ROW_BUTTON_DANGER,
} from './account-row'

/** Status text when a status request failed, with the reason. */
function StatusError(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <span role='alert' className='text-t-warn'>
      ! {t(props.message)}
    </span>
  )
}

function TwoFARow() {
  const { t } = useTranslation()
  const twoFA = useTwoFA(true)
  const setup = useTwoFASetup(twoFA.refetch)
  const [dialog, setDialog] = useState<'disable' | 'backup' | null>(null)
  const status = twoFA.status

  let value: ReactNode = <SkeletonText width={8} />
  let note: string | undefined
  let actions: ReactNode = null
  if (!twoFA.loading && twoFA.error) {
    value = <StatusError message={twoFA.error} />
    actions = (
      <Button
        type='button'
        variant='outline'
        className={ROW_BUTTON}
        onClick={() => void twoFA.refetch()}
      >
        {t('Retry')}
      </Button>
    )
  } else if (!twoFA.loading) {
    value = (
      <>
        <OnOffText on={status.enabled} />
        {status.locked && <span className='text-t-bad'>　{t('Locked')}</span>}
      </>
    )
    note = status.enabled
      ? t('Backup codes remaining: {{count}}', {
          count: status.backup_codes_remaining,
        })
      : t('Sign-in also asks for a code from your authenticator app.')
    actions = status.enabled ? (
      <>
        <Button
          type='button'
          variant='outline'
          className={ROW_BUTTON}
          onClick={() => setDialog('backup')}
        >
          {t('New backup codes')}
        </Button>
        <Button
          type='button'
          variant='outline'
          className={ROW_BUTTON_DANGER}
          onClick={() => setDialog('disable')}
        >
          {t('Turn off')}
        </Button>
      </>
    ) : (
      <Button
        type='button'
        variant='outline'
        className={ROW_BUTTON}
        onClick={setup.start}
        disabled={setup.active}
      >
        {t('Enable')}
      </Button>
    )
  }

  return (
    <>
      <AccountRow
        label={t('Two-step verification')}
        note={note}
        actions={actions}
      >
        {value}
      </AccountRow>
      <SecureVerificationDialog {...setup.verificationDialogProps} />
      <TwoFASetupDialog
        key={setup.setupDialogProps.setupData?.flow_token ?? 'initializing'}
        {...setup.setupDialogProps}
      />
      <TwoFADisableDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => setDialog(open ? 'disable' : null)}
        onSuccess={twoFA.refetch}
      />
      <TwoFABackupDialog
        open={dialog === 'backup'}
        onOpenChange={(open) => setDialog(open ? 'backup' : null)}
        onSuccess={twoFA.refetch}
      />
    </>
  )
}

function PasskeyRow() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const passkey = usePasskeyActions()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const busy =
    passkey.registering || passkey.removing || passkey.verification.isActive

  let value: ReactNode = <SkeletonText width={8} />
  let note: string | undefined
  let actions: ReactNode = null
  if (!passkey.loading && passkey.statusError) {
    value = <StatusError message={passkey.statusError} />
    actions = (
      <Button
        type='button'
        variant='outline'
        className={ROW_BUTTON}
        onClick={() => void passkey.fetchStatus()}
      >
        {t('Retry')}
      </Button>
    )
  } else if (!passkey.loading) {
    value = <OnOffText on={passkey.enabled} />
    if (passkey.enabled) {
      const lastUsed =
        passkey.lastUsed && !Number.isNaN(Date.parse(passkey.lastUsed))
          ? formatTimestampRelative(
              Date.parse(passkey.lastUsed),
              'milliseconds',
              locale
            )
          : t('Not used yet')
      note = `${t('Last used:')} ${lastUsed}`
    } else if (passkey.supported) {
      note = t('Sign in with your fingerprint, face or security key.')
    } else {
      note = t('Passkey not supported on this device')
    }
    actions = passkey.enabled ? (
      <Button
        type='button'
        variant='outline'
        className={ROW_BUTTON_DANGER}
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        {t('Remove')}
      </Button>
    ) : (
      <Button
        type='button'
        variant='outline'
        className={ROW_BUTTON}
        disabled={!passkey.supported || busy}
        onClick={() => void passkey.register()}
      >
        {passkey.registering ? t('Registering…') : t('Enable')}
      </Button>
    )
  }

  return (
    <>
      <AccountRow label='Passkey' note={note} actions={actions}>
        {value}
      </AccountRow>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Remove Passkey?')}
        desc={t(
          'Removing Passkey will require you to sign in with your password next time. You can re-register anytime.'
        )}
        confirmText={t('Remove')}
        destructive
        isLoading={passkey.removing}
        handleConfirm={() => {
          setConfirmOpen(false)
          void passkey.remove()
        }}
      />
      <SecureVerificationDialog {...passkey.verification.dialogProps} />
    </>
  )
}

/** Second factors: two-step verification codes and Passkey. */
export function VerificationPane() {
  const { t } = useTranslation()
  return (
    <Pane title={<b>{t('Sign-in verification')}</b>}>
      <dl className='m-0 px-5 pt-3 pb-2'>
        <TwoFARow />
        <PasskeyRow />
      </dl>
    </Pane>
  )
}
