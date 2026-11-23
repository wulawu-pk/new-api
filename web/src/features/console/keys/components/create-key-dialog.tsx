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
import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LoadErrorText } from '@/components/terminal/data-states'
import { errorReason } from '@/components/terminal/lib'
import {
  TERM_BUTTON,
  TERM_BUTTON_PRIMARY,
  TERM_INPUT,
} from '@/components/terminal/styles'
import { TermSelect } from '@/components/terminal/term-select'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { ApiKey } from '@/features/keys/types'

import { useUserGroups } from '../../hooks/use-user-groups'
import {
  editKeyValues,
  getCreateKeySchema,
  type CreateKeyValues,
} from '../lib/create-key'
import { GroupPicker } from './group-picker'

type CreateKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CreateKeyValues) => Promise<void>
  submitting: boolean
  /** When set, the dialog edits this key instead of creating one. */
  editing?: ApiKey | null
}

const DEFAULTS: CreateKeyValues = {
  name: '',
  group: '',
  limit: '',
  expiry: 'never',
}

export function CreateKeyDialog(props: CreateKeyDialogProps) {
  const { t } = useTranslation()
  const groups = useUserGroups()
  const form = useForm<CreateKeyValues>({
    resolver: zodResolver(getCreateKeySchema(t)),
    defaultValues: DEFAULTS,
  })

  const editing = props.editing ?? null

  // Creating: preselect the first group once groups arrive.
  useEffect(() => {
    if (!props.open || editing) return
    const first = groups.data?.[0]?.key
    if (first && !form.getValues('group')) form.setValue('group', first)
  }, [props.open, editing, groups.data, form])

  useEffect(() => {
    if (!props.open) form.reset(DEFAULTS)
    else if (editing) form.reset(editKeyValues(editing))
  }, [props.open, editing, form])

  const expiryOptions = [
    { value: 'never', label: t('Never') },
    { value: '30', label: t('30 days') },
    { value: '90', label: t('90 days') },
  ]
  if (editing && editing.expired_time !== -1) {
    expiryOptions.unshift({
      value: 'keep',
      label: t('Keep {{date}}', {
        date: dayjs.unix(editing.expired_time).format('YYYY-MM-DD'),
      }),
    })
  }

  let submitLabel = props.submitting ? t('Creating…') : t('Create it')
  if (editing) submitLabel = props.submitting ? t('Saving…') : t('Save')

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? t('Edit key') : t('Create Key')}
      contentClassName='sm:max-w-[560px]'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            className={TERM_BUTTON}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='console-create-key'
            className={TERM_BUTTON_PRIMARY}
            disabled={props.submitting || !groups.data?.length}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='console-create-key'
          noValidate
          className='flex flex-col gap-[18px]'
          onSubmit={form.handleSubmit((values) => props.onSubmit(values))}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel className='text-t-fg2 text-[13px] font-normal'>
                  {t('Name')}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete='off'
                    placeholder={t('e.g. claude-code-laptop')}
                    className={TERM_INPUT}
                  />
                </FormControl>
                <FormDescription className='text-t-dim text-[12.5px]'>
                  {t('Only for telling keys apart.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='group'
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel
                  id='console-key-group-label'
                  className='text-t-fg2 text-[13px] font-normal'
                >
                  {t('Group')}
                </FormLabel>
                {groups.isPending && (
                  <span className='t-skeleton font-mono'>░░░░░░░░░░░░</span>
                )}
                {groups.isError && (
                  <LoadErrorText
                    api='/api/user/self/groups'
                    reason={errorReason(groups.error)}
                    onRetry={() => void groups.refetch()}
                  />
                )}
                {groups.data?.length === 0 && (
                  <p className='text-t-dim text-sm'>
                    {t('No groups are available to you. Contact support.')}
                  </p>
                )}
                {groups.data && groups.data.length > 0 && (
                  <GroupPicker
                    aria-labelledby='console-key-group-label'
                    groups={groups.data}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(fieldState.error)}
                  />
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid grid-cols-2 gap-3 max-[480px]:grid-cols-1'>
            <FormField
              control={form.control}
              name='limit'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-t-fg2 text-[13px] font-normal'>
                    {editing ? t('Quota left') : t('Spending limit')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode='decimal'
                      placeholder={t('No limit')}
                      className={`${TERM_INPUT} font-mono`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='expiry'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-t-fg2 text-[13px] font-normal'>
                    {t('Expires')}
                  </FormLabel>
                  <FormControl>
                    <TermSelect
                      value={field.value}
                      options={expiryOptions}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </Dialog>
  )
}
