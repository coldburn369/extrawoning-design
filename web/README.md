# ExtraWoning web

The Next.js frontend for the protected ExtraWoning preview.

```bash
npm install
npm run dev
npm run lint
npm run build
```

`trailingSlash: true` preserves canonical URLs such as `/landing/`. nginx
proxies the protected preview to this application while retaining ownership of
TLS, Basic Auth, `/health`, and `/api/`.

The app runs as a Next server because the existing security policy prohibits
inline scripts. `proxy.ts` creates a per-request nonce and Next applies it to
the framework scripts. This keeps a strict `script-src` policy without
`unsafe-inline`, which is required before authenticated dashboard routes move
into this application.

The `predev`/`prebuild` hook runs `scripts/prepare-legacy.mjs`. It assembles
route-specific ordered stylesheets, copies only referenced optimized assets,
and publishes the tested address-check modules under `/legacy/check/`. These
outputs are generated and gitignored, so the current design-system and route
files remain the source of truth during the compatibility phase.

The compatibility routes render the reviewed partials at the Next boundary.
This keeps each page byte-for-byte close while establishing routing, CSP and
deployment. Sections can move from this boundary to typed React components one
at a time.

During local development, `/api/*` is rewritten to
`EXTRAWONING_API_ORIGIN` (default `http://127.0.0.1:8001`). Production nginx can
continue owning its existing `/api/` location.

## Deployment

From the repository root:

```bash
cd web
npm ci
npm run lint
npm run build
cd ..
sudo cp deploy/extrawoning-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now extrawoning-web
sudo cp deploy/nginx-preview-extrawoning.conf /etc/nginx/sites-available/extrawoning-preview
sudo nginx -t
sudo systemctl reload nginx
```

The app listens only on `127.0.0.1:3012`. Restart `extrawoning-web` after a
successful build when deploying later application changes.

## Migration sequence

1. `/landing/` compatibility route and strict CSP foundation — complete.
2. `/privacy/` server-rendered document route — complete.
3. `/check/` compatibility route preserving the versioned renderer and test
   coverage — complete.
4. Convert compatibility boundaries into typed components route by route.
5. Authentication and `/dashboard/` after the product decisions in
   `DASHBOARD.md`.
6. Remove the legacy SSI routes only after route-by-route browser comparison.
