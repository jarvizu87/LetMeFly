# LetMeFly — Rebuilt Source of Truth

Version: `5.0.0-rebuild.1`

This project reconstructs the missing LetMeFly PWA source from the locked LetMeFly architecture, the completed local/cloud modules, and the current governed training-program releases.

## What this rebuild preserves

- Public App Shell + Private Athlete Data
- IndexedDB as the active workout database
- account optional / local-only training supported
- Supabase Auth + PostgreSQL cloud synchronization
- revision-checked, idempotent sync path
- safe first account bootstrap
- backup/export and restore/import
- legacy localStorage discovery/migration without deleting the original
- mobile-first Workout Mode with horizontally swiped sections
- readiness page first and session review last
- set-level logging with RPE and barbell plate helper
- program history snapshots so future program changes do not rewrite completed sessions
- Private Vault cloud status
- PWA service worker that does not cache private Supabase responses

## Important source coverage

This is a faithful reconstruction of the **application architecture**, but it is not pretending that every byte of the lost program-data source was recovered.

### Crownforge

The governing release is Crownforge Revised Integrated v2.1, source engine v1.7.20.

The rebuilt source embeds the complete opening-week app flow for September 7–13, 2026 so the app can support the immediate Crownforge launch. Program governance, Day 1 loading, the opening-week calendar, readiness rules, and the core training structure were recovered from the governed releases.

Some opening-week support/accessory values were reconstructed from the retained v1.7.20 engine and related governed source material where direct v2.1 Week-1 text was not retrievable in the current file interface. See `docs/SOURCE_COVERAGE.md` before treating every support load as source-verified.

Weeks 2–14 and the Crown Maintenance bridge are intentionally **not fabricated**. They should be imported from the governing program source into the public structured program database.

### Black Crown

Black Crown Revised v2.0 is registered in the public program catalog, but the 54-week program is intentionally `catalog-only` in this rebuild until the governing structured source is imported. The app does not invent missing Black Crown sessions.

## No personal athlete data is in this repository

The rebuilt public source does not contain a private athlete profile, training maxes, bodyweight, goals, workout history, readiness history, or cloud tokens.

A new athlete is created locally in IndexedDB. Existing legacy LetMeFly browser data can be discovered and migrated at runtime.

## Development

Requirements:

- Node.js 22.12+
- npm

```bash
npm install
npm run typecheck
npm run audit:source
npm run dev
```

Production build:

```bash
npm run build
```

## Public cloud configuration

Only these browser-visible variables are required:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never add a service-role/secret key, database password, SMTP password, or administrative credential to the client environment.

The existing Netlify `let-me-fly-public` project already has the correct live public Supabase URL and publishable key configured.

## Startup order

1. Open/upgrade IndexedDB.
2. Recover stale outbox operations.
3. Discover legacy localStorage if no canonical athlete exists.
4. Load local athlete/program/workout.
5. Render the training UI.
6. Start the optional cloud/auth layer.
7. Opportunistically synchronize.

Cloud initialization never gates local workout access.

## Workout write rule

Pressing Complete Set writes the set and sync outbox operation in one IndexedDB transaction. It does not wait for Supabase.

Starting a workout now also creates the entire session/exercise/set skeleton atomically, preventing a browser crash from leaving a half-created workout.

## PWA privacy boundary

The service worker may cache the public shell and public assets. It explicitly bypasses Supabase/auth/private API traffic and LetMeFly backup downloads.

## Deployment

`netlify.toml` builds `dist` with `npm run build` and applies baseline security headers/CSP.

Do not deploy the real athlete until the remaining browser integration items in `AUDIT_REBUILD.md` pass.

## Current result

The missing source-code dependency that previously blocked Stage 15 has now been reconstructed into a maintainable source tree. The remaining work is validation/integration, not architecture reconstruction.
