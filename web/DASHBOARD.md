# Dashboard decisions

The public routes can be migrated without changing product behaviour. An
authenticated dashboard cannot: these choices change the data model, API and
authorization boundary and must be made before implementation.

## Required before authentication

1. **Account type** — homeowners only, professionals only, or both.
2. **Sign-in method** — email magic link, password, or an external identity
   provider.
3. **Ownership model** — whether an address/report belongs to one user or to an
   organisation with multiple members.
4. **Roles** — for example owner, member and administrator, and what each role
   may read or change.
5. **Dashboard records** — saved checks, purchased reports, projects, documents
   and/or leads.
6. **Retention** — which address and household facts may be persisted. The
   current check deliberately keeps household answers in memory only.
7. **Commercial boundary** — free accounts, paid reports, subscriptions, or a
   combination.

## Architecture already established

- Next App Router and strict nonce-based CSP.
- Existing `/api/check` and `/api/leads` remain separate API contracts.
- nginx can keep routing `/api/` directly to the woningkans service.
- The public landing, privacy and check routes share the current token system
  without sharing route-specific CSS.

Authentication must be enforced by the API for protected data. Redirecting in
Next Proxy may improve navigation, but it is not an authorization boundary.
