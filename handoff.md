# Handoff

## Goal

Maintain and extend the **RGMC Consignment Web App** — an Ionic/Vue PWA used by field sales reps to scan items and submit sales/return orders against a GCP-hosted Business Central (BC) API.

Ongoing constraints and acceptance criteria:
1. All custom endpoints must use v2 (`/bc/custom/v2/...`) where a v2 exists in the BC API codebase.
2. Items must be filtered to the selected brand's `familyCode === brand.code` — both server-side (`?family_code=`) and client-side in cache.
3. Companies dropdown must be filtered to `consignmentAppVisible === true`.
4. Customers must be filtered by `brand.code` server-side via `?brand=`.
5. `VITE_API_BASE_URL` is a runtime Cloud Run env var injected at startup by `docker-entrypoint.sh` via nginx `envsubst` — it must NOT be baked into the build.
6. Login animations must remain functional: error shake, success ring, loading strip, sync status panel.
7. `setApiCompany()` must always be called with `company.code` (not `company.name`) so the `?company=` interceptor sends the correct value on all `/bc/` requests.

---

## Current State

**Branch: `master`. Working tree is clean. No uncommitted changes.**

### Known bug (unverified, spotted in code review during this session)

`src/stores/auth.store.ts:179` — the **bcrypt login success path** (the most commonly executed path) calls:
```ts
setApiCompany(selectedCompany.name);
```
but it should be:
```ts
setApiCompany(selectedCompany.code);
```

The plain-text password path at line 149 correctly uses `selectedCompany.code`. The bcrypt path was missed in commit `9397500` ("fixed company code parameter for bc api calls"). This means that after a normal bcrypt-verified login, all subsequent `/bc/` API calls (sync, submit, etc.) will send `?company=<name>` instead of `?company=<code>`, which may cause BC API to reject or misroute requests.

### What is working (committed, code-level complete):
- All v2 endpoints wired in `api.service.ts`
- Items filtered server-side by `?family_code=<brand.code>` and client-side in `useSync.ts` and `ScanningPage.vue`
- Login animations: card shake on error, green ring on success, loading strip, sync status panel with cycling texts
- `formatCurrency()` handles `undefined`/`null` (prevents crash on items missing `unitPriceIncVAT`)
- History screen: filter chips, detail modal, retry for failed sessions
- Submit screen: two independent submit buttons (sales + returns), series number display, finalize session

### Recent commits (newest first):
- `9397500` — fixed company code parameter for bc api calls (partial — missed auth.store.ts:179)
- `761ca24` — added companycode in getting brands (added `code` field to Company type, updated api.service.ts + LoginPage/SplashPage)
- `4c0170f` — added fix on company (api.service.ts, LoginPage.vue, SplashPage.vue)
- `b9ddc60` — Merge PR #4 from rgmc-apps/staging (merged staging→master)

---

## Files Actively Being Edited

No files are mid-change. All changes from prior sessions are committed.

Files that were modified in the last 3 commits (may need revisiting for the bug above):
- `src/services/api.service.ts` — company code normalization, v2 endpoints, `getItems(familyCode?)`, `getAllItemPricesForDate(productNos?)`
- `src/stores/auth.store.ts` — `setApiCompany()` call at line 179 uses `.name` instead of `.code` (bug)
- `src/views/LoginPage.vue` — company/brand select dropdowns, login animations
- `src/views/SplashPage.vue` — company restore on splash
- `src/types/index.ts` — `Company` now has `code` field

---

## Failed Attempts

- **What was tried**: Using `brand.itemFamilyCode` as the `family_code` filter for items — **Why it failed**: `item.familyCode` in BC maps to `brand.code`, not `brand.itemFamilyCode`. Changed to pass `brand.code` directly.
- **What was tried**: Showing static "Signed in" text whenever `loginState === 'success'` — **Why it failed**: This blocked the cycling sync texts from showing during post-login sync. Fixed by checking `loginState === 'success' && !isSyncing`.
- **What was tried**: Using `item.unitPriceIncVAT` directly from v2 API response without normalization — **Why it failed**: v2 items endpoint may return `unitPrice` instead, causing a `undefined.toLocaleString()` crash on ScanningPage. Fixed via normalization with fallback chain in `getItems()`.

---

## Next Step

**Fix the `setApiCompany` bug in the bcrypt login path, then deploy:**

1. Edit `src/stores/auth.store.ts` line 179:
   ```ts
   // Change this:
   setApiCompany(selectedCompany.name);
   // To this:
   setApiCompany(selectedCompany.code);
   ```

2. Run `npx vue-tsc --noEmit` to confirm TypeScript is clean.

3. Commit and push to `staging` (Cloud Build auto-deploys to `rgmc-consignment-webapp` Cloud Run service).

4. After deploy, test on a phone:
   - Log in with bcrypt-hashed credentials — verify sync completes and items load filtered by brand.
   - DevTools console `[API]` logs should show `?company=<code>` not `?company=<name>` on all `/bc/` requests.

---

## Context & Gotchas

### `company.code` vs `company.name`
The BC API's `?company=` param expects the **company code** (e.g., `"RGMC"`), not the display name (e.g., `"RGMC Group"`). The `Company` type has both fields. The axios interceptor at `api.service.ts:49-54` injects `_companyName` (misleadingly named — it should hold the code). `setApiCompany()` sets this variable. If called with `.name` instead of `.code`, all BC API calls will fail or return wrong data silently.

### `brand.code` vs `brand.itemFamilyCode`
- `brand.code` — the BC dimension value code (e.g., `"NIKE"`). Maps to `item.familyCode`. Use this for item filtering.
- `brand.itemFamilyCode` — derived at splash/login by matching `itemFamily.description === brand.displayName`. Used for `checkBrandAccess()` brand-tag check only.

### V1 endpoints intentionally kept
- `/bc/custom/contacts/${contactId}/brand-tags` — no v2 equivalent in BC API router; used in `auth.store.ts:63`.
- `POST /bc/sales-orders` — standard BC route, not a custom endpoint; no v2 equivalent tested.

### Cloud Run / deployment
- CLI on this Windows machine is `gcloud.cmd` (not `gcloud`).
- Docker is NOT installed locally — builds run in Cloud Build.
- Cloud Build trigger fires on push to `staging` branch.
- `VITE_API_BASE_URL` is injected at container startup by `docker-entrypoint.sh` via `envsubst '$PORT $VITE_API_BASE_URL'` — never bake it into the build.
- Project: `durable-woods-465907-n1`, region: `asia-southeast1`.

### V2 contacts and auth fields
The v2 contacts endpoint must return `username` and `passwordHash` custom fields that auth depends on. If login breaks (user not found, or password check fails) after deploying, check DevTools `[API]` log on `GET /bc/custom/v2/contacts` — the v2 page (50309) may not expose those fields. If so, revert `getContacts()` to `/bc/custom/contacts` (v1).

### TypeScript check command
`npx vue-tsc --noEmit` — must pass clean before committing. Run from the project root.

### `extractList` handles three BC response shapes
`api.service.ts:99-108` normalizes `{ data: T[] }`, `{ value: T[] }`, and bare `T[]`. If any v2 endpoint returns a different shape, it logs `[API] extractList: unexpected response shape` and returns `[]` — things go empty, not crash.
