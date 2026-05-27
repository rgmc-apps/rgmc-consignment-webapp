# Handoff

## Goal

Ship and maintain the **RGMC Consignment Web App** on Google Cloud Run. The app is a mobile-first Ionic/Vue scanning tool for sales reps to build sales/return orders against a GCP-hosted Business Central API. All core features are built and deployed; remaining work is debugging a live data issue and verifying the latest fixes.

**Acceptance criteria (from original spec):**
- App loads at the Cloud Run URL
- Login pre-syncs data automatically (button cycles through sync labels, lands on home)
- ScanningPage has items available without a manual sync tap
- Barcode/item scan → confirm sheet with quantity stepper, discount selector, grand total
- Offline mode works (OFFLINE badge, scan available if items loaded, SubmitPage disabled)
- Pull-to-refresh on ScanningPage, LandingPage, HistoryPage
- No `QuotaExceededError` in localStorage for items
- All six screens work against live GCP API via nginx proxy (no CORS errors)
- All elements centred on mobile and desktop views

---

## Current State

| Area | Status |
|---|---|
| All `src/` source files | ✅ Complete, TypeScript clean |
| `vite build` | ✅ Passes |
| Dockerfile / nginx.conf / docker-entrypoint.sh | ✅ Working |
| Offline mode + pull-to-refresh | ✅ Deployed (`87e8772`) |
| ion-icon loadIcon URL error fix | ✅ Deployed (`8c4841a`) |
| API response shape defensive handling | ✅ Deployed (`faf1e09`) — **but root cause unconfirmed** |
| Desktop/mobile centring | ✅ Deployed (`39caa91`) |
| **`/bc/items` items loading on scan page** | ⚠️ **UNRESOLVED** — returns 200, but items may or may not appear |
| Cloud Run live revision | `rgmc-consignment-webapp-00013-gzv` |
| Cloud Build for `39caa91` (centring commit) | `a13a439f` — **WORKING at last check** (~5 min build) |

**Live URL:** `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app`

---

## Files Actively Being Edited

*(All committed and pushed — working tree is clean except for local `dist/` build artifacts which are irrelevant to deployment)*

- `src/views/ScanningPage.vue` — Fixed `pulling-icon` string→SVG import (loadIcon fix); added `chevronDownCircleOutline` to icon imports
- `src/views/LandingPage.vue` — Same loadIcon fix
- `src/views/HistoryPage.vue` — Same loadIcon fix
- `src/services/api.service.ts` — Replaced all `res.data.data` calls with `extractList<T>(res.data)` helper; added interceptor that `console.info`s every `/bc/*` response shape; removed `ApiListResponse` import (no longer needed)
- `src/theme/variables.css` — Added `@media (min-width: 768px)` block that centres `ion-app` as a 520px phone-column with gold frame; added `ion-content::part(scroll)` max-width; added `ion-title { text-align: center }`
- `src/views/LoginPage.vue` — Login container `margin: 0 auto`, `max-width: 520px`; footer `text-align: center`

---

## Failed Attempts

- **`pulling-icon="chevron-down-circle-outline"` (string attribute)** — Ionic's `ion-icon` web component calls `new URL(svgPath, import.meta.url)` to dynamically fetch the SVG. In the production Vite bundle, `import.meta.url` resolves to an empty/invalid base, causing `TypeError: Failed to construct 'URL': Invalid base URL`. Fixed by importing the icon object and binding with `:pulling-icon="chevronDownCircleOutline"`. Every other `ion-icon` in the codebase already used the `:icon="imported"` pattern correctly.

- **`res.data.data` direct access for API responses** — If the GCP API returns `{ "value": [...] }` (Business Central OData native) or a bare array `[...]` instead of `{ "data": [...] }`, the old code returned `undefined` which then crashed `_itemsMemory = undefined.map(...)`. Fixed with `extractList<T>()` that tries `.data`, then `.value`, then bare array, returning `[]` on all unknown shapes.

- **localStorage for items** — localStorage has a hard 5 MB per-origin cap. Even with 6-field slimming + 120-char description truncation, the items catalog exceeded it. Items now live in `_itemsMemory` (module-level JS variable in `storage.service.ts`).

- **Inline `envsubst` in Dockerfile** — Unreliable in Alpine busybox sh; nginx ran as child of sh, not PID 1. Fixed with `docker-entrypoint.sh`.

- **Unquoted nginx regex braces** — `location ~* \.[0-9a-f]{8}\.(js|css...)$` caused nginx startup failure. Fixed by wrapping regex in double quotes.

- **`VITE_API_BASE_URL` set to GCP origin** — CORS blocked all requests. Fixed by leaving it empty and proxying `/bc/*` server-side via nginx.

---

## Next Step

**Confirm whether items now load after the `extractList()` fix.**

1. Wait for Cloud Build `a13a439f` to finish (or trigger `gcloud builds list --limit=3` to verify SUCCESS)
2. Open `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app` in Chrome
3. Open DevTools → **Console** tab
4. Log in → navigate to Scan tab → watch for this log line:

```
[API] GET /bc/items  status=200  → keys=…  { … }
```

**Interpret the log:**

| Log output | Meaning | Action |
|---|---|---|
| `→ keys=data` with items in array | `extractList()` works, items load ✅ | Done |
| `→ keys=value` with items | extractList now handles this ✅ | Verify items appear |
| `→ bare array` with items | extractList now handles this ✅ | Verify items appear |
| `→ keys=data` with **empty array** | API genuinely returns no data | Investigate GCP API — may need brand filter param or server-side issue |
| `→ keys=` (empty object `{}`) | API returning empty body | GCP API issue, not frontend |

If items still don't appear after a successful shape match, check `StorageService.getCachedItems()` in the console — if `_itemsMemory` is populated but scan screen shows empty, the bug is in `refreshCache()` / `cachedItems.value` reactivity.

---

## Context & Gotchas

### Deployment
- **GitHub push → Cloud Build trigger → Cloud Run deploy** (automatic, no manual docker build needed)
- Project ID: `durable-woods-465907-n1`
- Service: `rgmc-consignment-webapp`, Region: `asia-southeast1`
- GCP API upstream: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`
- Build takes ~5 min end-to-end after push

### `dist/` is tracked in git but irrelevant
`.gitignore` only excludes `node_modules`. The `dist/` directory is committed. However, the Dockerfile runs `npm run build` during Docker build, so Cloud Build always builds from source — committed `dist/` files are overwritten and never used for the deployed app. Don't worry about the local `dist/` diff.

### Items are in-memory only, not localStorage
`_itemsMemory` in `storage.service.ts` is a module-level `let`. Survives tab navigation but lost on page refresh. This is intentional — localStorage quota cannot hold the full catalog. Login pre-sync and ScanningPage `onMounted` auto-sync ensure items are always re-loaded when needed.

### nginx.conf is a template
Contains literal `${PORT}`. Copied to `/etc/nginx/nginx.conf.template`; `docker-entrypoint.sh` runs `envsubst '$PORT'` at container start to produce the real config. The single-quoted `'$PORT'` is intentional — only substitutes PORT, leaves nginx vars like `$uri` untouched.

### VITE_API_BASE_URL is baked at build time
Set to empty string in `.env.production`. Vite bakes it into the bundle. Axios makes relative `/bc/*` requests. Nginx proxies them to the GCP API. Do NOT set this as a Cloud Run runtime env var — it has no runtime effect.

### Desktop centring approach
`ion-app` has `position:fixed; left:0; right:0` by default (Ionic). The centering override uses:
```css
ion-app {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
  width: 520px !important;
}
```
`!important` is required to override Ionic's hardcoded inline styles.

### `ion-content::part(scroll)` CSS shadow part
Used to set `max-width: 520px; margin: auto` on the inner scroll container of every page globally. This is a native CSS shadow-part selector — supported in all modern browsers. If it ever stops working (e.g., Ionic update changes the part name), content will revert to full-width on desktop without breaking mobile.

### Auth guard + storage load ordering
`router.beforeEach` fires before `authStore.loadFromStorage()` (which runs in `router.isReady().then()`). Direct URL navigation to `/app/*` always redirects to `/splash`, which loads auth and redirects to `/app/home`. Do NOT move `loadFromStorage()` before the guard.

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand, user }` |
| `rgmc_cache_brands` | Brand[] |
| `rgmc_cache_contacts` | Contact[] |
| `rgmc_cache_customers` | Slim Customer[] `{id, number, displayName, city}` |
| `rgmc_cache_item_categories` | ItemCategory[] |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISOString }` |
| `rgmc_sessions` | ScanSession[] `status: 'submitted' \| 'failed'` |
| `rgmc_drafts` | ScanSession[] `status: 'draft'` |
| ~~`rgmc_cache_items`~~ | **Removed** — items in `_itemsMemory` only |

### OrderLine type (common bug source)
`OrderLine` has `itemName` (not `itemDisplayName`) and has NO `itemCategoryCode` field. Check `src/types/index.ts` before adding any code that references order line fields.

### `extractList<T>()` in api.service.ts
Added this session. Handles `{ data: T[] }`, `{ value: T[] }` (BC OData), and `T[]` (bare array). Returns `[]` on unknown shapes and logs a warning. All five GET list methods now use it instead of `res.data.data`.

### Capacitor not initialised
`@capacitor/cli` and `@capacitor/core` are in `package.json` but `npx cap add android/ios` has never been run. No `android/` or `ios/` directories exist.
