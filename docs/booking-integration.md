# Paired Angular / booking candidate

Production defaults to `https://papihairdesign.sk/`. Supply the public
`VITE_PAPI_WEBSITE_URL` only for the specific paired preview build. The URL must
be an HTTPS homepage without credentials/query/fragment; HTTP is loopback-only.
No ephemeral deployment URL is committed as the production default.

The Angular counterpart accepts `PAPI_BOOKING_APP_URL` at build time and must
come from `erikbabcan-commits/ANGULAR-PHD-WEB-papi`. Verify repository and SHA in
Vercel metadata; the existing custom domain may still serve the legacy source.

## Navigation

- Standalone `/` replaces its history entry with `/booking`, preserving query/hash.
- Dashboard is a React Router link to `/admin`; existing auth/role guards apply.
- Standalone Back to website navigates in the same window.
- Inside an iframe, request `papi:host-ready` support. Accept readiness only from
  the exact configured Angular origin (including the explicit canonical www
  variant for production) and `window.parent`. No wildcard origins are used.
- A ready host receives only `papi:navigate-home`, never a redirect URL. Angular
  verifies the child origin/window and routes its own page to `/`.
- A legacy/untrusted host without the protocol gets an ordinary new-tab fallback
  with `noopener noreferrer`; the website is never deliberately nested inside
  the booking frame. No top-navigation sandbox permission is required.

Language messages use the same narrow configured parent-origin rule. A preview
paired with one Angular origin does not trust arbitrary `*.vercel.app` parents.

## Reproducible checks

First run `pnpm run test:sandbox HEAD` with Node 22 and pnpm 10.11.0.
For paired checks, clean-export both exact commits, frozen-install their own pnpm
versions, then build and serve on separate loopback origins, for example:

```sh
# Angular clean export, pnpm 8.15.0:
PAPI_BOOKING_APP_URL=http://127.0.0.1:4397/booking pnpm run build:prod
# Booking clean export, pnpm 10.11.0; API values are local fixtures only:
VITE_PAPI_WEBSITE_URL=http://127.0.0.1:4396/ pnpm run build
# With both isolated previews already running:
PAPI_ANGULAR_URL=http://127.0.0.1:4396 PAPI_BOOKING_URL=http://127.0.0.1:4397 pnpm exec playwright test --config=integration/playwright.config.ts
```

The integration configuration refuses non-loopback URLs. Tests use authenticated
fixtures and block real reservation writes. Videos, screenshots and traces are
written to `integration/results` or `PAPI_INTEGRATION_OUTPUT`.

No production deployment or Supabase migration is performed by these checks.
Missing live availability RPC and live RLS remain separate blockers. Preview
Deployment Protection must not be disabled to make an embedded smoke test pass.
