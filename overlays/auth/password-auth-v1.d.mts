import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
export function createPasswordAuth(auth: Pick<SupabaseClient['auth'], 'getUser' | 'signInWithPassword' | 'updateUser'>): {
  signIn(email: string, password: string): Promise<{ user: User; session: Session }>
  setPassword(expectedUserId: string, password: string, confirmation: string): Promise<void>
}
