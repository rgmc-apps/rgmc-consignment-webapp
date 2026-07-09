# Handoff

## Goal

Maintain and extend the **RGMC Consignment Web App** — an Ionic/Vue PWA used by sales reps to scan items and submit sales/return orders against a GCP-hosted Business Central API. Ongoing goals:

1. Keep all custom API endpoints on v2 (`/bc/custom/v2/...`) wherever a v2 exists in the BC API codebase.
2. Keep items filtered to the brand's family code throughout: server-side fetch, client-side cache, and item modal/barcode lookup.
3. Keep the companies dropdown filtered by `consignmentAppVisible === true`.
4. Keep customers filtered by `brand.code` server-side via `?brand=`.
5. Keep `VITE_API_BASE_URL` as a runtime Cloud Run env var (nginx envsubst, not baked into build).
6. Keep the login screen animations: error shake, success ring + sync status panel, loading progress strip.

---

## Current State

**All changes from this session are committed. Working tree is clean on branch `staging`.**

Latest commits (newest first):
- `faa3f7a` — added login animation (success ring, sync status panel, cycling texts, card shake)
- `c838037` — added loading animations and item family code listing (loginPage loading strip, btn pulse)
- `54d1c0e` — added family code checking (client-side filter in sync + ScanningPage, price scoping)
- `ccf2988` — added v2 endpoints (contacts, items, item-families, sales-return-orders all moved to v2)
- `a3f80ac` — updated sync function (previous session)

### What is working (code-complete, committed, not yet verified in production):

**V2 endpoint coverage (`src/services/api.service.ts`):**
- `/bc/custom/v2/company-settings` — companies (already v2 from previous session)
- `/bc/custom/v2/customers?brand=<code>` — customers (already v2 from previous session)
- `/bc/custom/v2/contacts` — getContacts, updateContact
- `/bc/custom/v2/contacts/${id}/picture` — getContactPicture, updateContactPicture
- `/bc/custom/v2/items?family_code=<brandCode>` — getItems (server-side filter by brand code)
- `/bc/custom/v2/item-families` — getItemFamilies
- `/bc/custom/v2/item-prices`, `/active`, `/cache` — already v2 from previous session
- `/bc/custom/v2/sales-return-orders` — submitSalesReturnOrder
- `/bc/custom/contacts/${id}/brand-tags` — intentionally kept on v1 (no v2 equivalent in BC API)
- `/bc/sales-orders` — intentionally kept on unversioned BC standard route (not a custom endpoint)

**Item family code filtering:**
- `getItems(familyCode?)` in `api.service.ts:197` — passes `?family_code=<brandCode>` server-side
- `getAllItemPricesForDate(onDate, productNos?)` in `api.service.ts:239` — passes `?product_nos=<comma-list>` to scope prices to brand items only
- `useSync.ts:36-45` — fetches `rawItems` filtered server-side, then applies client-side guard: `items = brandCode ? rawItems.filter((i) => i.familyCode === brandCode) : rawItems`
- `useSync.ts:78-80` — price fetch uses `items.map((i) => i.number)` (already family-scoped)
- `ScanningPage.vue:671-678` — `refreshCache()` filters `StorageService.getCachedItems()` by `familyCode === brandCode` before assigning to `cachedItems`

**TypeError fix (`src/utils/format.ts`):**
- `formatCurrency(amount: number | undefined | null)` — now accepts undefined/null, defaults to 0
- `getItems()` normalization in `api.service.ts:205-206` — maps `unitPriceIncVAT: (i['unitPriceIncVAT'] ?? i['unitPrice'] ?? i['unit_price'] ?? 0)`

**Login animations (`src/views/LoginPage.vue`):**
- `loginState: ref<'idle' | 'loading' | 'success' | 'error'>('idle')` drives all animation classes
- **Error**: `isCardShaking` triggers `login-card--shake` (@keyframes login-shake, 420ms, auto-resets); `login-field--error` on username/password fields; clears when user types
- **Loading**: `login-progress-strip` (3px sweeping gold bar at top of card content, visible during `isLoading || isSyncing`); `login-btn--loading` (opacity breathing pulse 1.6s)
- **Success**: `login-card--success` (@keyframes card-success-ring — box-shadow expands green ring then settles); button turns green (`login-btn--success`, oklch 52% 0.15 145); cycling sync texts now show during sync-after-success (fixed: was blocked by `loginState === 'success'` shortcut)
- **Sync status panel** (`.login-sync-status`): appears when `loginState === 'success' && isSyncing` — green-tinted panel with `dots` spinner, cycling label text (with `out-in` swap transition keyed by label text), and subtitle "Preparing your workspace for offline use"
- `@media (prefers-reduced-motion: reduce)` covers all animations

**Deployment:**
- Staging Cloud Run service `rgmc-consignment-webapp` last deployed at commit `a3f80ac` (previous session — this session's changes are NOT yet deployed)
- Cloud Run env var `VITE_API_BASE_URL=https://rgmc-bc-api-staging-935246372408.asia-southeast1.run.app` is set correctly
- Cloud Build triggers on git push to deploy automatically

### What is unverified (needs live testing after deploy):
- Whether item filtering by `?family_code=<brand.code>` actually filters correctly (depends on whether BC items table's `familyCode` field matches `brand.code` exactly)
- Whether `?product_nos=<comma-list>` works correctly on the item-prices endpoint for large item sets
- Whether v2 contacts endpoint (`/bc/custom/v2/contacts`) returns the same fields as v1 (especially `username` and `passwordHash` which auth relies on for login)
- Whether the login animations look correct on a real phone screen

---

## Files Actively Being Edited

All committed. No files are mid-change.

- `src/services/api.service.ts` — 7 endpoints moved to v2; `getItems()` accepts `familyCode?` param; `getAllItemPricesForDate()` accepts `productNos?` param; `unitPriceIncVAT` normalization added to `getItems()`
- `src/composables/useSync.ts` — uses `brandCode` (not `itemFamilyCode`) for item filter; client-side family filter after fetch; price fetch scoped to filtered item numbers; removed unused `familyCode` variable
- `src/views/ScanningPage.vue` — `refreshCache()` filters `cachedItems` by `familyCode === brandCode`
- `src/utils/format.ts` — `formatCurrency()` widened to `number | undefined | null`
- `src/views/LoginPage.vue` — full animation additions: error shake, success card ring, loading strip, button states, sync status panel, cycling texts restored

---

## Failed Attempts

- **What was tried**: Showing static "Signed in" text whenever `loginState === 'success'` — **Why it failed**: This blocked the cycling loading texts (`syncBtnLabel`) from showing during the sync phase after successful login. Fixed by checking `loginState === 'success' && !isSyncing` for the "Signed in" state.
- **What was tried**: Using `brand.itemFamilyCode` as the `family_code` filter for items — **Why it failed**: The items' `familyCode` field in BC maps to `brand.code`, not `brand.itemFamilyCode`. The `itemFamilyCode` is a lookup derived from matching item family `description` to brand `displayName` — a different concept. Changed to pass `brandCode` directly.
- **What was tried**: `item.unitPriceIncVAT` used directly from API response without normalization — **Why it failed**: The v2 items endpoint may return `unitPrice` instead of `unitPriceIncVAT`, causing `undefined.toLocaleString()` crash on ScanningPage. Fixed by adding normalization with fallback chain in `getItems()` and guarding `formatCurrency()`.

---

## Next Step

**Deploy to Cloud Run staging and verify live:**

1. Push the `staging` branch — Cloud Build should trigger automatically and deploy to `rgmc-consignment-webapp`. Verify at:
   `https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app`

2. After deploy, open the app on a phone and test:
   - **Login flow**: select company + brand, enter credentials, verify: error shake on wrong password, card green ring + cycling texts + sync status panel on correct credentials
   - **Item list**: open ItemSelectorModal — confirm only items matching the selected brand's `familyCode === brand.code` appear; no items from other brands visible
   - **Barcode scan**: scan an item barcode — confirm it resolves to an item in the filtered list; wrong-brand barcodes should show "No item found"
   - **Contacts login**: confirm login still works — v2 contacts endpoint must return `username` and `passwordHash` fields (auth depends on them)

3. If items list is empty after login: check DevTools console for `[API]` log on `GET /bc/custom/v2/items?family_code=...` — verify the `familyCode` field in the response matches what `brand.code` would be. If they don't match, the filter in `useSync.ts:38` needs to pass `brand.itemFamilyCode` instead of `brand.code`, and `ScanningPage.vue:676` needs the same change.

4. If contacts login fails: check `[API]` log on `GET /bc/custom/v2/contacts` — the v2 contacts endpoint may not return `username`/`passwordHash` custom fields that the v1 endpoint exposed. If so, revert `getContacts()` and `updateContact()` back to `/bc/custom/contacts` (v1).

---

## Context & Gotchas

### Family code: `brand.code` vs `brand.itemFamilyCode`
These are two different things:
- `brand.code` — the BC dimension value code for the brand (e.g., "NIKE"). This is what `item.familyCode` maps to in BC.
- `brand.itemFamilyCode` — derived at splash/login time by matching `itemFamily.description === brand.displayName`. Used for the `checkBrandAccess()` tag check in auth, NOT for item filtering.

The item filter uses `brand.code`. If items don't filter correctly, this is the first thing to check.

### V2 contacts and the auth fields
The v1 `/bc/custom/contacts` endpoint exposed custom fields `username` and `passwordHash` on the BC contact record. The v2 endpoint `/bc/custom/v2/contacts` uses a different AL page (50309 vs presumably the same, but verify). If login breaks after deploying (user not found, or password check fails), the v2 contacts endpoint may not be returning those fields. `api.service.ts:122-141` normalizes the contact fields — `username` and `passwordHash` are in the normalization map.

### V1 endpoint intentionally kept: brand-tags
`/bc/custom/contacts/${contactId}/brand-tags` stays on v1. The v2 contacts router (`rgmc_contact_v2_routes.py`) has no brand-tags sub-route. Checked the file — confirmed. Used in `auth.store.ts:63` for `checkBrandAccess()`.

### V1 endpoint intentionally kept: sales orders submit
`POST /bc/sales-orders` (standard BC route, not a custom endpoint) stays as-is. There is a `/bc/custom/v2/sales-orders` but the submit payload and processing may differ. Not changed.

### Cloud Run deployment
- `gcloud.cmd` is the CLI on this Windows machine (not `gcloud`)
- Project: `durable-woods-465907-n1`, region: `asia-southeast1`
- Docker is NOT installed locally — builds run in Cloud Build
- The Cloud Build trigger likely fires on push to `staging` branch
- `VITE_API_BASE_URL` is set in Cloud Run env vars — `docker-entrypoint.sh` writes it into nginx.conf at startup via `envsubst '$PORT $VITE_API_BASE_URL'`

### Login animation classes and their triggers
| State | Card class | Button class | Trigger |
|---|---|---|---|
| Loading (auth) | — | `login-btn--loading` | `isLoading` |
| Loading (sync) | — | `login-btn--loading` | `isSyncing` |
| Error | `login-card--shake` (auto-removes after 420ms via `isCardShaking`) | — | `loginState === 'error'` |
| Success | `login-card--success` (persists) | `login-btn--success` (green) | `loginState === 'success'` |

### `extractList` handles three BC response shapes
`api.service.ts:99-108` handles `{ data: T[] }`, `{ value: T[] }`, and bare `T[]`. If any v2 endpoint returns a different shape, it logs `[API] extractList: unexpected response shape` and returns `[]` — things go empty, not crash.

### `?company=` auto-injected on all `/bc/` requests
The axios request interceptor (`api.service.ts:49-54`) appends `?company=<name>` to every `/bc/` request. The v2 endpoints all accept a `company` query param and default to `BC_COMPANY` env var if absent. This is transparent and handled automatically.

### TypeScript type-check command
`npx vue-tsc --noEmit` — passes clean as of last commit. Run this before committing any changes.
