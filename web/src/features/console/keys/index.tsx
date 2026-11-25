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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import {
  ConsoleTable,
  ConsoleTableBody,
  ConsoleTableHeader,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from '@/components/terminal/console-table'
import {
  LoadErrorText,
  TableMessageRow,
  TableSkeletonRows,
} from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import { Pane } from '@/components/terminal/pane'
import {
  TERM_BUTTON_GHOST,
  TERM_BUTTON_PRIMARY,
} from '@/components/terminal/styles'
import { Button } from '@/components/ui/button'
import {
  deleteApiKey,
  fetchTokenKey,
  getApiKeys,
  patchApiKey,
  updateApiKeyStatus,
} from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { groupName } from '../lib/groups'
import { CREATE_KEY_EVENT, ConsolePageHeader } from '../shell/console-shell'
import { ApiAddressPane } from './components/api-address-pane'
import { CreateKeyDialog } from './components/create-key-dialog'
import {
  buildCreateKeyPayload,
  buildKeyPatch,
  maskedKeyTail,
  type CreateKeyValues,
} from './lib/create-key'
import {
  KeyRevealError,
  createKeyAndFetch,
  revealKey,
  withSkPrefix,
  type CreatedKey,
} from './lib/create-key-flow'

const CONSOLE_KEYS_QUERY_KEY = ['console', 'keys'] as const
const COLS = 8

const STATUS_ENABLED = 1
const STATUS_DISABLED = 2

/** The key changed on the server since the page last read it. */
class KeyConflictError extends Error {}

function KeyStatus(props: { status: number }) {
  const { t } = useTranslation()
  if (props.status === STATUS_ENABLED) {
    return <span className='text-t-ok text-[12.5px]'>● {t('Working')}</span>
  }
  const labels: Record<number, string> = {
    2: t('Disabled'),
    3: t('Expired'),
    4: t('Quota used up'),
  }
  return (
    <span className='text-t-dim text-[12.5px]'>
      ○ {labels[props.status] ?? t('Disabled')}
    </span>
  )
}

type ConsoleKeysProps = {
  /** Open the create dialog on arrival (`?create=1`). */
  openCreate?: boolean
  /** Called once the request to open the dialog has been taken. */
  onOpenCreateHandled?: () => void
}

export function ConsoleKeys(props: ConsoleKeysProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [revealed, setRevealed] = useState<CreatedKey | null>(null)
  // A key that was created but whose value could not be read yet.
  const [unrevealed, setUnrevealed] = useState<{
    id: number
    name: string
  } | null>(null)
  const [toDelete, setToDelete] = useState<ApiKey | null>(null)
  const [toEdit, setToEdit] = useState<ApiKey | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const keys = useQuery({
    queryKey: CONSOLE_KEYS_QUERY_KEY,
    queryFn: async () => {
      const response = requireServerSuccess(
        await getApiKeys({ p: 1, size: 100 })
      )
      return response.data?.items ?? []
    },
    meta: { errorToast: false },
  })

  // `n` in the status bar, or ?create=1 from another page, opens the dialog.
  useEffect(() => {
    const open = () => setCreateOpen(true)
    window.addEventListener(CREATE_KEY_EVENT, open)
    return () => window.removeEventListener(CREATE_KEY_EVENT, open)
  }, [])
  const { openCreate, onOpenCreateHandled } = props
  useEffect(() => {
    if (!openCreate) return
    setCreateOpen(true)
    onOpenCreateHandled?.()
  }, [openCreate, onOpenCreateHandled])

  const warnConflict = () =>
    toast.warning(
      t(
        'The quota of this key changed while you were editing. The form shows the current values; check them and save again.'
      )
    )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['console'] })

  const showCreated = async (created: CreatedKey) => {
    if (await copyToClipboard(created.key)) {
      toast.success(
        t('Created {{name}}; the key is copied', { name: created.name })
      )
    } else {
      setRevealed(created)
    }
  }

  const create = useMutation({
    mutationFn: (values: CreateKeyValues) =>
      createKeyAndFetch(
        buildCreateKeyPayload(values),
        t('Failed to create key'),
        // The key exists from here on; show it in the list right away.
        () => void invalidate()
      ),
    onSuccess: async (created) => {
      setCreateOpen(false)
      void invalidate()
      await showCreated(created)
    },
    onError: (error) => {
      if (error instanceof KeyRevealError) {
        // The key was created. Retrying must only read it, never create.
        setCreateOpen(false)
        setUnrevealed({ id: error.id, name: error.keyName })
        void invalidate()
        return
      }
      handleServerError(error, t('Failed to create key'))
    },
  })

  const retryReveal = useMutation({
    mutationFn: async (target: { id: number; name: string }) => ({
      ...target,
      key: await revealKey(target.id, t('Failed to copy')),
    }),
    onSuccess: async (created) => {
      setUnrevealed(null)
      await showCreated(created)
    },
    onError: (error) => handleServerError(error, t('Failed to copy')),
  })

  const update = useMutation({
    mutationFn: async (args: { key: ApiKey; values: CreateKeyValues }) => {
      // Only the changed fields are sent. The server switches an expired or
      // used-up key back on by itself once its date or quota is fixed.
      const patch = buildKeyPatch(args.key, args.values)
      if (!patch) return false
      const response = await patchApiKey(args.key.id, patch)
      if (!response.success && response.code === 'token_conflict') {
        throw new KeyConflictError()
      }
      if (!response.success) {
        throw createServerError(response, t('Update failed'))
      }
      return true
    },
    onSuccess: (saved) => {
      setEditOpen(false)
      if (!saved) return
      toast.success(t('Saved'))
      void invalidate()
    },
    onError: async (error, args) => {
      if (!(error instanceof KeyConflictError)) {
        handleServerError(error, t('Update failed'))
        return
      }
      // Nothing was saved. Refill the dialog with the key as it is now.
      warnConflict()
      const refreshed = await keys.refetch()
      const fresh = refreshed.data?.find((item) => item.id === args.key.id)
      if (fresh) setToEdit(fresh)
      else setEditOpen(false)
      void invalidate()
    },
  })

  const toggle = useMutation({
    mutationFn: async (key: ApiKey) => {
      const next =
        key.status === STATUS_ENABLED ? STATUS_DISABLED : STATUS_ENABLED
      const response = await updateApiKeyStatus(key.id, next)
      if (!response.success && response.code === 'token_conflict') {
        throw new KeyConflictError()
      }
      if (!response.success) {
        throw createServerError(response, t('Update failed'))
      }
      return next
    },
    onSuccess: (next) => {
      toast.success(next === STATUS_ENABLED ? t('Enabled') : t('Disabled'))
      void invalidate()
    },
    onError: (error) => {
      if (!(error instanceof KeyConflictError)) {
        handleServerError(error, t('Update failed'))
        return
      }
      // The key changed meanwhile and nothing was saved: show it as it is.
      warnConflict()
      void keys.refetch()
      void invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: async (key: ApiKey) => {
      const response = await deleteApiKey(key.id)
      if (!response.success) {
        throw createServerError(response, t('Delete failed'))
      }
    },
    onSuccess: () => {
      setToDelete(null)
      toast.success(t('Key deleted'))
      void invalidate()
    },
    onError: (error) => handleServerError(error, t('Delete failed')),
  })

  const copyKey = useMutation({
    mutationFn: async (key: ApiKey) => {
      const response = await fetchTokenKey(key.id)
      if (!response.success || !response.data?.key) {
        throw createServerError(response, t('Failed to copy'))
      }
      return withSkPrefix(response.data.key)
    },
    onSuccess: async (full) => {
      if (await copyToClipboard(full)) toast.success(t('Copied'))
      else toast.error(t('Copy failed; select and copy it manually'))
    },
    onError: (error) => handleServerError(error, t('Failed to copy')),
  })

  const list = keys.data ?? []
  const stateMode = !keys.isPending && (keys.isError || list.length === 0)

  return (
    <>
      <ConsolePageHeader
        title={t('API Keys')}
        description={t(
          'Each key belongs to one group; the group decides which models it can call and their price. The list shows the last 4 characters; use Copy to get the full key.'
        )}
        actions={
          <Button
            type='button'
            className={TERM_BUTTON_PRIMARY}
            onClick={() => setCreateOpen(true)}
          >
            {t('Create Key')}
          </Button>
        }
      />

      <Pane
        hero
        title={
          <>
            <b>{t('Keys')}</b>
            {keys.data
              ? `　${t('{{count}} keys', { count: list.length })}`
              : ''}
          </>
        }
      >
        <div className='overflow-x-auto px-1 pt-2 pb-1'>
          <ConsoleTable minWidth={880} stateMode={stateMode}>
            <ConsoleTableHeader>
              <ConsoleTableRow className='hover:bg-transparent'>
                <ConsoleTh>{t('Name')}</ConsoleTh>
                <ConsoleTh>Key</ConsoleTh>
                <ConsoleTh>{t('Group')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Used so far')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Quota left')}</ConsoleTh>
                <ConsoleTh>{t('Expires')}</ConsoleTh>
                <ConsoleTh>{t('Status')}</ConsoleTh>
                <ConsoleTh kind='num'>{t('Actions')}</ConsoleTh>
              </ConsoleTableRow>
            </ConsoleTableHeader>
            <ConsoleTableBody>
              {keys.isPending && <TableSkeletonRows cols={COLS} />}
              {keys.isError && (
                <TableMessageRow cols={COLS}>
                  <LoadErrorText
                    api='/api/token/'
                    reason={errorReason(keys.error)}
                    onRetry={() => void keys.refetch()}
                  />
                </TableMessageRow>
              )}
              {keys.data && list.length === 0 && (
                <TableMessageRow cols={COLS}>
                  {t(
                    'No keys yet. A key belongs to a group; pick the group when you create it and it is ready to use.'
                  )}
                  <div className='mt-3'>
                    <Button
                      size='sm'
                      className={TERM_BUTTON_PRIMARY}
                      onClick={() => setCreateOpen(true)}
                    >
                      {t('Create Key')}
                    </Button>
                  </div>
                </TableMessageRow>
              )}
              {list.map((key) => (
                <ConsoleTableRow key={key.id}>
                  <ConsoleTd className='max-w-[220px] truncate'>
                    {key.name}
                  </ConsoleTd>
                  <ConsoleTd kind='mono'>{maskedKeyTail(key.key)}</ConsoleTd>
                  <ConsoleTd>{groupName(key.group || '', t) || '—'}</ConsoleTd>
                  <ConsoleTd kind='num'>
                    {formatQuota(key.used_quota)}
                  </ConsoleTd>
                  <ConsoleTd kind='num'>
                    {key.unlimited_quota
                      ? t('No cap')
                      : formatQuota(key.remain_quota)}
                  </ConsoleTd>
                  <ConsoleTd kind='mono'>
                    {key.expired_time === -1
                      ? t('Never')
                      : dayjs.unix(key.expired_time).format('YYYY-MM-DD')}
                  </ConsoleTd>
                  <ConsoleTd>
                    <KeyStatus status={key.status} />
                  </ConsoleTd>
                  <ConsoleTd>
                    <div className='flex justify-end gap-1'>
                      <Button
                        size='sm'
                        variant='ghost'
                        className={TERM_BUTTON_GHOST}
                        disabled={copyKey.isPending}
                        onClick={() => copyKey.mutate(key)}
                        aria-label={t('Copy key {{name}}', { name: key.name })}
                      >
                        {t('Copy')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        className={TERM_BUTTON_GHOST}
                        onClick={() => {
                          setToEdit(key)
                          setEditOpen(true)
                        }}
                        aria-label={t('Edit key {{name}}', { name: key.name })}
                      >
                        {t('Edit')}
                      </Button>
                      {(key.status === STATUS_ENABLED ||
                        key.status === STATUS_DISABLED) && (
                        <Button
                          size='sm'
                          variant='ghost'
                          className={TERM_BUTTON_GHOST}
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(key)}
                        >
                          {key.status === STATUS_ENABLED
                            ? t('Disable')
                            : t('Enable')}
                        </Button>
                      )}
                      <Button
                        size='sm'
                        variant='ghost'
                        className={`${TERM_BUTTON_GHOST} hover:text-t-bad hover:border-t-bad`}
                        onClick={() => setToDelete(key)}
                      >
                        {t('Delete')}
                      </Button>
                    </div>
                  </ConsoleTd>
                </ConsoleTableRow>
              ))}
            </ConsoleTableBody>
          </ConsoleTable>
        </div>
      </Pane>

      <ApiAddressPane />

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={create.isPending}
        onSubmit={async (values) => {
          await create.mutateAsync(values).catch(() => undefined)
        }}
      />

      <CreateKeyDialog
        open={editOpen}
        editing={toEdit}
        onOpenChange={setEditOpen}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!toEdit) return
          await update
            .mutateAsync({ key: toEdit, values })
            .catch(() => undefined)
        }}
      />

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('Delete key')}
        desc={t(
          'Delete {{name}}? Programs using this key will stop working. This cannot be undone.',
          { name: toDelete?.name ?? '' }
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={remove.isPending}
        handleConfirm={() => toDelete && remove.mutate(toDelete)}
      />

      <Dialog
        open={unrevealed != null}
        onOpenChange={(open) => !open && setUnrevealed(null)}
        title={t('Key created')}
        description={t(
          'Created {{name}}, but its value could not be loaded. Try again; this reads the same key and does not create another.',
          { name: unrevealed?.name ?? '' }
        )}
      >
        <div className='flex justify-end'>
          <Button
            type='button'
            className={TERM_BUTTON_PRIMARY}
            disabled={retryReveal.isPending}
            onClick={() => unrevealed && retryReveal.mutate(unrevealed)}
          >
            {t('Load the key again')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={revealed != null}
        onOpenChange={(open) => !open && setRevealed(null)}
        title={t('Key created')}
        description={t(
          'Copying to the clipboard did not work here. Copy the key below and keep it safe.'
        )}
      >
        <div className='flex items-center gap-2'>
          <code className='bg-t-bg border-t-faint min-w-0 flex-1 border px-3 py-2.5 font-mono text-[13px] break-all'>
            {revealed?.key}
          </code>
          <CopyButton value={revealed?.key ?? ''} variant='outline' />
        </div>
      </Dialog>
    </>
  )
}
