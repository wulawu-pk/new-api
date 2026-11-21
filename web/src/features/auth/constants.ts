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
import { z } from 'zod'

import { accountPasswordSchema } from '@/lib/password-policy'

// ============================================================================
// Form Schemas
// ============================================================================

export const loginFormSchema = z.object({
  username: z.string().min(1, 'Please enter your username or email'),
  password: z.string().min(1, 'Please enter your password'),
})

export const registerFormSchema = z
  .object({
    username: z.string().min(1, 'Please enter your username'),
    email: z.string().optional(),
    password: accountPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })

export const forgotPasswordFormSchema = z.object({
  email: z.string().email({
    message: 'Please enter a valid email address',
  }),
})

export const otpFormSchema = z.object({
  otp: z.string().min(1, 'Please enter a code.'),
})

// ============================================================================
// Validation Constants
// ============================================================================

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20
export const OTP_LENGTH = 6
export const BACKUP_CODE_LENGTH = 9 // XXXX-XXXX format
export const BACKUP_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i
export const OTP_REGEX = /^\d{6}$/

// ============================================================================
// Countdown Constants
// ============================================================================

export const EMAIL_VERIFICATION_COUNTDOWN = 30 // seconds
export const PASSWORD_RESET_COUNTDOWN = 30 // seconds

// ============================================================================
// OAuth Constants
// ============================================================================

export const OAUTH_POPUP_CALLBACK_MESSAGE = 'oauth:popup:callback'
export const OAUTH_POPUP_RESULT_MESSAGE = 'oauth:popup:result'
export const TELEGRAM_BIND_RESULT_MESSAGE = 'telegram:binding:result'

// ============================================================================
// Styling
// ============================================================================

/** Inline text link on the auth pages. */
export const AUTH_LINK_CLASS =
  'text-foreground decoration-landing-accent/60 hover:decoration-landing-accent font-medium underline decoration-1 underline-offset-4 transition-colors'

/** Pill buttons on the auth forms. */
export const AUTH_BUTTON_CLASS = 'h-11 w-full justify-center gap-2 rounded-full'

/** The submit pill, inverted like the landing pages' primary action. */
export const AUTH_SUBMIT_CLASS = `${AUTH_BUTTON_CLASS} bg-foreground text-background hover:bg-foreground/85`

/**
 * Form-level: taller text inputs matching the pill buttons. Targets
 * `input[data-slot]` because FormControl renames the slot to `form-control`;
 * the checkbox's hidden native input has no slot and stays untouched.
 */
export const AUTH_FORM_CLASS =
  'grid gap-5 [&_input[data-slot]]:h-11 [&_input[data-slot]]:rounded-xl [&_input[data-slot]]:px-3.5'
