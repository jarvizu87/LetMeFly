export function createPrivateArtBridge(options: {
  activeAthlete: () => Promise<{ id: string } | null | undefined>
  auth: { getLocalSession: () => Promise<any>; getTrustedCurrentUser: () => Promise<any> }
  client: any
  configured: () => boolean
}): { bridge: { version: number; context: () => Promise<{ athleteId: string | null }>; readCloud: (id: string) => Promise<any[]>; readAsset: (id: string, key: string, rowId: string, path: string) => Promise<Blob | null> }; invalidate: () => void }
