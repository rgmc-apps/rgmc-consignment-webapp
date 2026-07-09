# Handoff

## Goal

Maintain and extend the **RGMC Consignment Web App** — an Ionic/Vue PWA used by sales reps to scan items and submit sales/return orders against a GCP-hosted Business Central API. Ongoing goals:

1. Keep all API endpoints on the correct v2 custom routes (`/bc/custom/v2/...`).
2. Keep the **companies dropdown** filtered by `consignmentAppVisible === true`.
3. Keep the **customers list/dropdown** filtered by the brand selected at login, sourced from the v2 customers endpoint.
4. Keep `VITE_API_BASE_URL` as the single runtime env var set in **Cloud Run** (not baked into the build) — nginx substitutes it at container startup via `envsubst`.
5. Keep the app deployable and clean (no TypeScript errors, no broken builds).

---

## Current State

**All changes from this session are committed. Working tree is clean on branch `staging`.**

Latest commits (newest first):
- `a3f80ac` — updated sync function (useAuthStore for brand, removed getBrands from sync)
- `da030b7` — fix for customer display (`name` → `displayName` mapping priority)
- `d907170` — fix for customer displays (field normalization in `getCustomers`)
- `829c2ea` — changed parameter from `brand_code` to `brand`
- `b037b48` — changed customers to v2 endpoint, brand filter, simplified `useCustomerFilter`
- `d73044a` — VITE_API_BASE_URL moved to Cloud Run runtime (nginx envsubst)
- `4166b6c` — staging URL in `.env`
- `059acd0` — company settings feature (`consignmentAppVisible`, camelCase)
- `dfa8bf3` — switch companies to v2 endpoint

### What is working (code-complete, not yet verified in production):

**Companies:**
- Endpoint: `/bc/custom/v2/company-settings`
- Filter: `consignmentAppVisible === true` (camelCase, optional field — missing field = excluded)
- Used in: `SplashPage.vue` and `LoginPage.vue` via `ApiService.getCompanies()`

**Customers:**
- Endpoint: `/bc/custom/v2/customers?brand=<brand.code>&company=<name>`
- Field normalization in `getCustomers()` maps `name` → `displayName` (v2 API returns `name`, not `displayName`)
- `useSync.ts` reads `authStore.brand?.code` (live) with fallback to `StorageService.getAuth()?.brand?.code`
- `useCustomerFilter.ts` stripped of brand-keyword logic — only does search query filtering now
- Customer modal in `ScanningPage.vue` shows brand tag in title + brand-aware placeholder + smart empty state

**Drafts (LandingPage):**
- Sorted A→Z by `brand.displayName` using `localeCompare`

**API base URL (Cloud Run):**
- `axios baseURL` is `''` — all `/bc/*` calls are relative paths
- In **dev**: Vite proxy (`vite.config.ts`) reads `VITE_API_BASE_URL` from `.env` → currently points to staging (`https://rgmc-bc-api-staging-935246372408.asia-southeast1.run.app`)
- In **production**: `docker-entrypoint.sh` runs `envsubst '$PORT $VITE_API_BASE_URL'` to write nginx.conf at container startup; nginx proxies `/bc/*` to the URL set in Cloud Run env vars
- `.env.production` no longer contains `VITE_API_BASE_URL` — only `VITE_GATEWAY_URL`
- `Dockerfile` no longer has a build-arg override for `VITE_API_BASE_URL`

### What is unverified (needs live testing):
- Whether `/bc/custom/v2/company-settings` returns `consignmentAppVisible` in its response shape
- Whether `/bc/custom/v2/customers?brand=<code>` actually filters correctly on the API side
- Whether the customer field normalization (`name` → `displayName`) matches what the v2 endpoint actually returns
- Whether the `extractList` helper correctly unwraps the v2 customers response shape (`{ data: [] }` vs `{ value: [] }` vs bare array)

---

## Files Actively Being Edited

All committed. No files are mid-change.

- `src/services/api.service.ts` — `getCompanies()` → v2 company-settings endpoint + consignmentAppVisible filter; `getCustomers(brandCode?)` → v2 customers endpoint with `?brand=` param + full field normalization (name priority); `axios baseURL` set to `''`
- `src/types/index.ts` — `Company` has `consignmentAppVisible?: boolean` (camelCase)
- `src/composables/useSync.ts` — imports `useAuthStore`; reads `brandCode` and `familyCode` from live authStore (fallback to storage); `getBrands()` removed from sync critical path; customers always fetched with current brand
- `src/composables/useCustomerFilter.ts` — fully rewritten: no brand-keyword logic, only search query filter; signature is `useCustomerFilter(allCustomers, searchQuery)`
- `src/views/LandingPage.vue` — `brandRef` removed from `useCustomerFilter` call; `visibleDrafts` sorted by `brand.displayName`
- `src/views/ScanningPage.vue` — `brandRef` removed from `useCustomerFilter` call; customer modal title shows brand tag + brand-aware placeholder + smart empty state; `.modal-brand-tag` style added
- `nginx.conf` — `/bc/` proxy target is `${VITE_API_BASE_URL}` (substituted at runtime); Host header uses `$proxy_host`
- `docker-entrypoint.sh` — `envsubst '$PORT $VITE_API_BASE_URL'`
- `Dockerfile` — removed `ARG VITE_API_BASE_URL` build-arg override block
- `.env` — `VITE_API_BASE_URL` points to staging; `BC_API_PROXY_TARGET` removed
- `.env.production` — `VITE_API_BASE_URL` removed; only `VITE_GATEWAY_URL` remains
- `vite.config.ts` — dev proxy reads `env.VITE_API_BASE_URL` (was `env.BC_API_PROXY_TARGET`)

---

## Failed Attempts

- **What was tried**: Using `BC_API_PROXY_TARGET` and `VITE_API_BASE_URL` as separate env vars (one for Vite proxy, one for axios) — **Why it failed**: Redundant; two vars pointing to the same URL caused confusion and the wrong one was sometimes out of sync.
- **What was tried**: Setting `VITE_API_BASE_URL` as a Cloud Run env var and relying on `import.meta.env.VITE_API_BASE_URL` in browser JS — **Why it failed**: `VITE_*` variables are baked into the JS bundle at build time; Cloud Run env vars are only available at runtime and cannot reach the browser bundle.
- **What was tried**: Using `ConsignmentAppVisible` (PascalCase) in the Company type and filter — **Why it failed**: The v2 company-settings endpoint returns camelCase (`consignmentAppVisible`); the PascalCase filter never matched, so the dropdown was always empty.
- **What was tried**: `displayName` as the primary field in customer normalization — **Why it failed**: The v2 customers endpoint returns `name` instead of `displayName`; customer list showed `?` for all names until `name` was moved first in the fallback chain.
- **What was tried**: Client-side brand-keyword filtering in `useCustomerFilter.ts` (the `BRAND_FILTER_MAP` approach with normalized display name matching) — **Why it failed**: Not actually broken, but removed intentionally because server-side filtering at `/bc/custom/v2/customers?brand=` makes it redundant and the keyword map was brittle.

---

## Next Step

**Deploy to Cloud Run and verify the three v2 endpoints live:**

1. Build and deploy the container (the Cloud Run service must have `VITE_API_BASE_URL` set to the correct BC API URL in its environment variables).

2. After deploy, open the app and check these in DevTools → Network:
   - `GET /bc/custom/v2/company-settings` → response must include `consignmentAppVisible: true/false` on each company; only `true` ones appear in the dropdown
   - `GET /bc/custom/v2/customers?brand=<code>&company=<name>` → response must return customers with a `name` field (not `displayName`); customer list on home screen and ScanningPage modal must show real names
   - `GET /bc/custom/v2/item-prices` → already working (unchanged)

3. If the companies dropdown is empty: the v2 endpoint either doesn't return `consignmentAppVisible` or uses a different casing — check the raw response shape in the `[API]` console log (the response interceptor logs all `/bc/` responses).

4. If customers still show `?`: check the raw JSON from the v2 endpoint in the console log — identify the actual field name for customer name and update the normalization fallback in `api.service.ts:182`.

---

## Context & Gotchas

### Cloud Run env var is the single source of truth for the BC API URL
Set `VITE_API_BASE_URL` in Cloud Run → Environment Variables. The container startup script (`docker-entrypoint.sh`) writes it into `nginx.conf` via `envsubst`. The browser never sees this value — it just makes relative `/bc/*` requests which nginx proxies server-side. No rebuild needed to switch between staging and prod.

### Local dev still uses .env
`VITE_API_BASE_URL` in `.env` drives the Vite dev proxy (`vite.config.ts:18`). Currently set to staging. The browser in dev also makes relative `/bc/*` requests; Vite's proxy routes them.

### Companies endpoint field name is camelCase
`consignmentAppVisible` (camelCase) — not `ConsignmentAppVisible` (PascalCase). The BC custom v2 endpoint uses camelCase. The type in `src/types/index.ts:5` and the filter in `api.service.ts:113` both use camelCase.

### Customers field name: `name` not `displayName`
The v2 customers endpoint returns `name` as the customer display name. The normalization in `api.service.ts:182` maps it: `displayName: (c['name'] ?? c['displayName'] ?? c['customerName'] ?? '')`. If the customer list is blank, check the raw API response in console.

### `extractList` handles three response shapes
Helper at `api.service.ts:99–108` handles `{ data: T[] }`, `{ value: T[] }`, and bare `T[]`. If the v2 endpoints return a different shape, it logs a warning and returns `[]` — customers/companies will be empty, not crash.

### `getBrands()` is NOT called during `useSync.sync()`
Brands are loaded on the SplashPage at company-select time (`SplashPage.vue:189`), enriched with item family codes, and stored in cache. The sync function (`useSync.ts`) no longer calls `getBrands()` — removing it from the critical path was intentional to avoid overwriting the enriched brand cache.

### `useCustomerFilter` signature changed
Old: `useCustomerFilter(brand, allCustomers, searchQuery)` — brand parameter existed for keyword matching.
New: `useCustomerFilter(allCustomers, searchQuery)` — brand parameter removed. If you add a caller, use the new two-argument signature.

### `?company=` is auto-injected on all `/bc/` requests
The axios request interceptor (`api.service.ts:49–54`) appends `?company=<name>` to every request whose URL starts with `/bc/`. The company name is set via `setApiCompany()` after login. Both `/bc/custom/v2/company-settings` and `/bc/custom/v2/customers` receive this param — confirm the v2 endpoints accept or ignore it gracefully (company-settings endpoint is top-level and may not need it).

### Bug report payload (unchanged, still relevant)
`useErrorReporter.ts` builds a bug report URL with `VITE_GATEWAY_URL` (still a build-time var, correctly so) + `/report-issue`. Error payloads include `{ screen, ...requestBody }` spread at the top level. Only POST endpoints (sales orders, return orders) populate `body` on `ApiError`.

### Build / type-check
- Type-check: `npx vue-tsc --noEmit` (passes clean as of last commit)
- Build: `vite build`
- Chunk size warning on `index-*.js > 500kB` is pre-existing, not a failure
