export function normalizePhone(value: string): string
export function createPhoneOtp(auth: any): {
  request: (phone: string) => Promise<void>
  verify: (phone: string, token: string) => Promise<{user: any; session: any}>
}
