# Handoff

## Goal

Maintain and extend the **RGMC Consignment Web App** — an Ionic/Vue PWA used by sales reps to scan items and submit sales/return orders against a GCP-hosted Business Central API. The primary ongoing goals are:

1. Keep the **companies dropdown** reliable — only companies with `ConsignmentAppVisible === true` in Business Central are shown.
2. Keep the **IT/MIS bug reporting link** rich and useful — every error that opens the report page should carry the full API request payload and the screen where it happened.
3. Keep the app deployable and clean (no TypeScript errors, no broken builds).

---

## Current State

**Code changes from this session are in the working tree but NOT committed.**

- `src/services/api.service.ts` and `src/types/index.ts` — modified, unstaged
- `handoff.md` — staged (prior session version), but then overwritten with this file

All changes compile cleanly; `vue-tsc --noEmit` passes with zero errors.

### What was done this session

#### From prior session (already committed)
- `ApiError` has a 5th constructor param `body?: unknown` — the axios error interceptor captures `error.config?.data` (parsed from JSON string if needed) and stores it there.
- `useErrorReporter.ts` extracts `error.body` from `ApiError`, merges it with any explicitly-passed `payload`, and sets `payload=` (JSON) on the bug report URL. The payload object is `{ screen: window.location.pathname, ...requestBody }`.
- Item prices: switched to v2 endpoint `/bc/custom/v2/item-prices/active` and added `updateCachedItemPrice` + `getAllItemPricesForDate` methods.

#### This session
- Changed the companies endpoint from `/bc/companies` → `/bc/custom/v2/companies`
- Added client-side filtering: only companies where `ConsignmentAppVisible === true` are returned (others silently excluded from the dropdown)
- Added `ConsignmentAppVisible?: boolean` to the `Company` type in `src/types/index.ts`

### How the companies flow works end-to-end
1. `SplashPage.vue` and `LoginPage.vue` both call `ApiService.getCompanies()`
2. `getCompanies()` hits `/bc/custom/v2/companies`, runs `extractList<Company>()` on the response, then filters to `ConsignmentAppVisible === true`
3. The filtered list is bound to the companies dropdown in both pages

---

## Files Actively Being Edited

- `src/services/api.service.ts` — `getCompanies()` now calls `/bc/custom/v2/companies` (line 116) and filters by `ConsignmentAppVisible === true` (line 117). Changes are **unstaged**.
- `src/types/index.ts` — `Company` interface now has `ConsignmentAppVisible?: boolean` (line 5). Changes are **unstaged**.

---

## Failed Attempts

None this session. Both edits compiled cleanly on first try and `vue-tsc --noEmit` passed with zero errors.

---

## Next Step

**Commit the two file changes, then verify in a live environment.**

1. Stage and commit:
   ```
   git add src/services/api.service.ts src/types/index.ts
   git commit -m "switch companies to v2 endpoint, filter by ConsignmentAppVisible"
   ```

2. Deploy or run the app and confirm:
   - The dropdown only shows companies where `ConsignmentAppVisible` is `true` in Business Central
   - Companies without the flag (or where it's `false`) are absent
   - If the dropdown is empty, check: (a) the v2 endpoint actually returns `ConsignmentAppVisible` in its response shape, and (b) the response shape matches one of `{ data: [] }`, `{ value: [] }`, or bare array — the `extractList()` helper handles all three, but if BC returns something different it will warn in the console and return `[]`

3. Also still outstanding: **verify the `payload=` parameter appears in a real bug report URL** — trigger a deliberate API error (POST submit with network offline) and confirm the URL contains `&payload={"screen":"/submit","customerNo":"...","lines":[...]}`.

---

## Context & Gotchas

### Companies endpoint change
- Old endpoint: `/bc/companies` (standard BC API)
- New endpoint: `/bc/custom/v2/companies` (custom GCP gateway endpoint)
- The `?company=` query param injected by the request interceptor applies to all `/bc/` URLs, so it will be appended to this request too — confirm the v2 endpoint accepts or ignores it gracefully (it may not need it since companies are top-level)

### `ConsignmentAppVisible` field name casing
- The field is PascalCase (`ConsignmentAppVisible`) matching Business Central naming conventions — do not camelCase it
- It is typed as `?: boolean` (optional) so companies missing the field entirely won't cause runtime errors; they will simply not pass the `=== true` filter

### `extractList` shapes
The helper (api.service.ts:103–112) handles three response shapes from the GCP API:
- `{ data: T[] }` — expected wrapper
- `{ value: T[] }` — Business Central OData native
- `T[]` — bare array
If the v2 endpoint returns something different, it logs a warning and returns `[]`.

### `ApiError.body` is only set for requests with a body
- `POST /bc/sales-orders` and `POST /bc/custom/sales-return-orders` → `body` populated on error
- `GET` endpoints (companies, brands, items, etc.) → `body` is `undefined` → `payload=` won't appear in the report URL for those errors. This is intentional.

### Payload is spread, not nested
Bug report payload is `{ screen, ...requestBody }` — fields are at the top level. A sales order error produces `{ "screen": "/submit", "customerNo": "C001", "lines": [...] }`, not `{ "screen": "/submit", "body": { ... } }`.

### Report URL base
`VITE_GATEWAY_URL` env var → fallback `https://rgmc-gateway-935246372408.asia-southeast1.run.app` → appended with `/report-issue`. Note the hyphenated region (`asia-southeast1`), not `asiasoutheast1`.

### Theme system (unchanged, still relevant)
Three themes: `minimalist | light | dark` in `localStorage('rgmc_theme_v2')`. Default is `minimalist`. Applied as `data-theme` on `<html>`. Per-component overrides use a class (e.g., `.lp--minimalist`) on `<ion-page>` since scoped CSS can't reach `[data-theme]` on `<html>`.

### Build
- Type-check: `npx vue-tsc --noEmit`
- Build: `vite build`
- Chunk size warning on `index-*.js > 500kB` is pre-existing, not a failure

### `APP_VERSION` in `src/version.ts`
Must be bumped manually before each GCP deployment to trigger the first-login bug report tooltip for users. Tooltip state tracked in `localStorage('rgmc_seen_version')`.
