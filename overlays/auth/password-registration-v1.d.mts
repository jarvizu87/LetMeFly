import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
export interface RegistrationAvailability { available: boolean; message: string }
export interface RegistrationSettings {
  disable_signup?: boolean
  mailer_autoconfirm?: boolean
  external?: { email?: boolean }
}
export function createPasswordRegistration(
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'signUp'>,
  readSettings: () => Promise<RegistrationSettings>,
): {
  availability(): Promise<RegistrationAvailability>
  register(email: string, password: string, confirmation: string): Promise<{ user: User; session: Session }>
}
