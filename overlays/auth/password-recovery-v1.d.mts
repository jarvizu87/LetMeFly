import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
export class PasswordRecoveryError extends Error {}
export function isPasswordRecoveryReturn(value: string): boolean
export function passwordRecoveryReturnUrl(value: string): string
export function createPasswordRecovery(
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'resetPasswordForEmail' | 'verifyOtp' | 'exchangeCodeForSession'>,
  options: { projectUrl: string; pageUrl(): string },
): {
  request(email: string): Promise<void>
  verifyLink(value: string): Promise<{ user: User; session: Session; passwordRecovery: true }>
  completeReturn(value: string, replaceUrl: (value: string) => void): Promise<{ user: User; session: Session; passwordRecovery: true } | null>
}
