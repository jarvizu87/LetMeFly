# Deployment Notes

## Canonical hosted services

### Official LetMeFly app
- Netlify project: `let-me-fly`
- Site URL: `https://let-me-fly.netlify.app`
- Netlify site ID: `ae10a4fd-b70d-4e13-b320-3e57c2ff7d11`
- Production branch: `main`
- Deployment mode: Git-connected continuous deployment
- Visitor access: Netlify team SSO required

This is the canonical LetMeFly application. All approved production UI and app-shell releases deploy here from GitHub `main`.

### Legacy/quarantined site
- Netlify project: `let-me-fly-public`
- Site URL: `https://let-me-fly-public.netlify.app`
- Netlify site ID: `5e21db36-d363-4d79-a259-1e026703c7b3`
- Status: legacy / do not use for production
- Visitor access: Netlify team SSO required

Do not rename or delete the legacy site yet. Browser-local data is origin-scoped, so keeping the original URL intact preserves the possibility of recovering any old localStorage/IndexedDB data from devices that used that site.

The legacy project contains only normal frontend Supabase client configuration at the Netlify project level. Do not treat that configuration as athlete data.

## Data architecture

The hosted app shell and training/program logic are separate from private athlete state.

Private athlete data belongs in local/private browser storage and authenticated cloud storage. Do not hard-code athlete profile data, workout history, TMs, readiness, PRs, notes, or other private athlete state into the public Git repository or static Netlify bundle.

## Production deployment flow

1. Make changes on a feature branch.
2. Run the governed source, Crownforge, Exercise Intelligence, UI, TypeScript, and production-build audits.
3. Merge approved changes into `main`.
4. Netlify automatically builds and deploys `main` to `let-me-fly`.
5. Verify the resulting production deploy before treating the release as complete.

Do not manually drop ZIPs into Netlify for normal releases.

## Command V2 Netlify build

Netlify reads the repository root `netlify.toml`.

```text
Build command: bash ci/build-command-v2.sh
Publish directory: .build-src/letmefly_app/dist
```

## Required frontend environment variables

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never create or expose a frontend variable containing a Supabase secret/service-role key.

## Legacy-data handling

If old athlete data may exist under `let-me-fly-public.netlify.app`, recover/export it from that exact origin before deleting or renaming the legacy project. Netlify cannot inspect browser-local localStorage/IndexedDB remotely.
