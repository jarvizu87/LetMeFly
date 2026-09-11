export const PROFILE_FIELDS: Readonly<Record<string, readonly string[]>>
export function profileValues(athlete: Record<string, any>): Record<string, string>
export function validateProfilePatch(value: unknown): Record<string, string>
export function parseProfileImport(raw: string, athleteId: string): { athleteId: string; fields: Record<string, string>; labels: Record<string, string> }
export function mergeProfilePatch(athlete: Record<string, any>, input: unknown, expectedInput: unknown, now: string): Record<string, any> | null
