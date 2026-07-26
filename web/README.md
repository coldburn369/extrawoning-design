# ExtraWoning web

The incremental Next.js frontend. It is intentionally isolated from the current
SSI preview while routes are migrated and compared.

```bash
npm install
npm run dev
npm run lint
npm run build
```

`trailingSlash: true` preserves `/landing/`. The Next application is not wired
to the current nginx preview yet; the existing SSI pages remain live while
routes are migrated and compared.

The app runs as a Next server because the existing security policy prohibits
inline scripts. `proxy.ts` creates a per-request nonce and Next applies it to
the framework scripts. This keeps a strict `script-src` policy without
`unsafe-inline`, which is required before authenticated dashboard routes move
into this application.

The `predev`/`prebuild` hook runs `scripts/prepare-legacy.mjs`. It assembles the
existing ordered stylesheets and copies only the referenced optimized assets
into the Next public directory. Both outputs are generated and gitignored, so
the current design-system and landing files remain the source of truth.

The first slice renders the existing landing section partials at build time.
This keeps the reviewed page byte-for-byte close while establishing the Next
route. Sections can move from the compatibility boundary to typed React
components one at a time.

## Migration sequence

1. `/landing/` compatibility route and strict CSP foundation — complete.
2. `/privacy/` as a server-rendered document route.
3. `/check/` as typed client components, preserving the existing API contract
   and its fixture/test coverage.
4. Authentication and `/dashboard/`.
5. Remove the legacy SSI routes only after route-by-route browser comparison.
