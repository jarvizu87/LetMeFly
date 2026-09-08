import { cloudConfigured, supabase } from '../auth/supabase-client'
import { LetMeFlyAuthService } from '../auth/auth-service'
import { CloudBootstrapService } from '../auth/bootstrap-service'
import { PrivateVaultController } from '../auth/private-vault-controller'
import { SupabaseSyncRemote } from '../sync/remote-adapter'

export interface CloudRuntime {
  configured: boolean
  auth: LetMeFlyAuthService
  remote: SupabaseSyncRemote
  bootstrap: CloudBootstrapService
  vault: PrivateVaultController
  start(): Promise<void>
  stop(): void
  syncSoon(): void
}

export function createCloudRuntime(appVersion = '5.0.0-rebuild.1'): CloudRuntime {
  const auth = new LetMeFlyAuthService()
  const remote = new SupabaseSyncRemote(supabase as any)
  const bootstrap = new CloudBootstrapService(remote)
  const vault = new PrivateVaultController(auth, bootstrap, remote, appVersion)
  let syncTimer: number | null = null
  let onlineHandler: (() => void) | null = null
  let visibilityHandler: (() => void) | null = null

  const syncSoon = () => {
    if (!cloudConfigured || syncTimer !== null) return
    syncTimer = window.setTimeout(() => {
      syncTimer = null
      void vault.syncNow().catch((error) => {
        console.warn('LetMeFly cloud sync pending', error)
      })
    }, 300)
  }

  return {
    configured: cloudConfigured,
    auth,
    remote,
    bootstrap,
    vault,
    async start() {
      if (!cloudConfigured) return
      await vault.initialize()
      onlineHandler = syncSoon
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') syncSoon()
      }
      window.addEventListener('online', onlineHandler)
      document.addEventListener('visibilitychange', visibilityHandler)
      syncSoon()
    },
    stop() {
      if (onlineHandler) window.removeEventListener('online', onlineHandler)
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
      if (syncTimer !== null) window.clearTimeout(syncTimer)
      vault.dispose()
    },
    syncSoon,
  }
}
