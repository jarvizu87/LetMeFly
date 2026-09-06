# Deployment Notes

## Existing hosted services

- Netlify project: `let-me-fly-public`
- Supabase project ref: `dvdooeipptaqelvlaept`

The Netlify project already has the public Supabase URL and publishable key configured.

## Recommended flow

1. Put this source in a persistent Git repository.
2. Connect that repository to the existing `let-me-fly-public` Netlify project.
3. Run a Deploy Preview first.
4. Verify IndexedDB onboarding without signing in.
5. Verify service-worker offline launch.
6. Create a synthetic athlete and test OTP/bootstrap/sync.
7. Test a second browser profile/device hydration.
8. Run conflict and backup/restore tests.
9. Only after those pass, migrate the real athlete browser state.
10. Keep the old legacy localStorage until several real sessions and a full restore drill succeed.

## Netlify build

```text
Build command: npm run build
Publish directory: dist
```

## Required environment variables

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Do not create a frontend variable containing a secret/service-role key.
