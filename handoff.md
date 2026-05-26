# Handoff

## Goal

Ship the **RGMC Consignment Web App** to production on Google Cloud Run, fully working end-to-end. All application phases are complete. The remaining work is infrastructure: rebuild and deploy the Docker image so that all code changes from this session reach production.

**Acceptance criteria:**
- App loads at the Cloud Run URL
- Login pre-syncs data automatically (user sees "Loading data…" then lands on a ready home screen)
- ScanningPage has items available without requiring a manual sync tap
- Barcode/item scan → confirm sheet appears with quantity stepper, discount selector, grand total, and Add to Sales/Return buttons
- No `QuotaExceededError` in localStorage for items
- All six screens function against the live GCP API via nginx proxy (no CORS errors)

---

## Current State

**All application code: COMPLETE AND TYPE-CLEAN.** `vue-tsc --noEmit` exits 0. `vite build` passes (last confirmed in previous session; no structural changes since).

**Cloud Run deployment: STALE.** The last deployed image is from commit `9cabbf6` ("fix for data cache") which included the in-memory items fix. The current uncommitted changes (LoginPage pre-sync, ScanningPage auto-sync + no-items notice + confirm sheet discount/total) are **NOT yet deployed**. A fresh build + deploy is required.

| Area | Status |
|---|---|
| All `src/` source files | ✅ Complete, TypeScript clean |
| `vite build` | ✅ Passes |
| `Dockerfile` + `nginx.conf` + `docker-entrypoint.sh` | ✅ Fixed (previous session) |
| `.env.production` | ✅ `VITE_API_BASE_URL` empty — nginx proxy handles `/bc/*` |
| `storage.service.ts` — items in-memory | ✅ Committed (`9cabbf6`) |
| `LoginPage.vue` — pre-sync after login | ✅ Coded, **NOT committed, NOT deployed** |
| `ScanningPage.vue` — auto-sync, no-items notice, confirm sheet + discount + total | ✅ Coded, **NOT committed, NOT deployed** |
| Cloud Run deployment | ⏳ **Needs rebuild + redeploy** |

---

## Files Actively Being Edited

Files with **uncommitted** changes at end of session:

- `src/views/LoginPage.vue` — Added `isSyncing = ref(false)` local state. After `authStore.login()` succeeds, runs `Promise.all([getCustomers(), getItems(), getItemCategories()])` and stores results via `StorageService`. Button shows "Signing in…" during auth, then "Loading data…" during sync, then navigates to `/app/home`. Sync failure is caught and swallowed (non-fatal — user can retry from scanning page). All three phases (auth, sync-in-progress, idle) disable/label the submit button correctly.

- `src/views/ScanningPage.vue` — Four separate changes:
  1. `onMounted` is now `async`; after `refreshCache()`, if `cachedItems.value.length === 0`, calls `handleSync()` automatically (handles tab-refresh case where items aren't in memory)
  2. Added `lastSyncDate` to the `useSync()` destructure
  3. "No cache" state card now branches: if `lastSyncDate && cachedItems.length === 0` shows "No items found / Contact administrator / Retry Sync" with a warning icon; otherwise shows the original "Data not loaded yet / Sync Now" state
  4. Confirm add sheet extended: breakpoint raised to 0.92; added `confirmDiscountType` ref (default `'percent'`), `confirmDiscountValue` ref (default 0), `confirmTotal` computed (calls same `computeTotal` helper as the main form); template now has a Discount section (IonSegment for %/₱Amt + numeric input) and a Grand Total banner (gold, live-updating); `doConfirm()` now passes discount type and value into the order line instead of hardcoded `percent / 0`

Files with **committed** changes (already in repo, NOT yet deployed):

- `src/services/storage.service.ts` — (`9cabbf6`) Items are now stored in a module-level `let _itemsMemory: Item[]` instead of localStorage. `getCachedItems()` returns this var; `setCachedItems()` populates it with a 6-field slim (id, number, displayName, description≤120chars, itemCategoryCode, unitPrice). `clearAll()` resets `_itemsMemory` and also evicts any stale `rgmc_cache_items` key left from before the migration. Customers are also slimmed to {id, number, displayName, city} before writing to localStorage.

---

## Failed Attempts

- **What was tried**: Slimming `setCachedItems` to 6 fields + 120-char description truncation, writing to localStorage — **Why it failed**: localStorage has a hard 5 MB per-origin cap (total for all keys). Even with the slim, the GCP items catalog exceeded it. The `QuotaExceededError` persisted because field-slimming cannot solve a total-quota problem when the dataset itself is too large.

- **What was tried**: Earlier attempt to slim items to 10 fields (including `type`, `itemCategoryId`, `baseUnitOfMeasure`, `lastModifiedDateTime`) in localStorage — **Why it failed**: Same quota issue; those 4 fields were dropped but the dataset was still too large.

- **What was tried** (previous session): `CMD envsubst '$PORT' < template > config && nginx` inline in Dockerfile — **Why it failed**: Shell quoting of `'$PORT'` unreliable in Alpine busybox sh; nginx ran as child of sh, not PID 1. Fixed with `docker-entrypoint.sh`.

- **What was tried** (previous session): Unquoted nginx regex `location ~* \.[0-9a-f]{8}\.(js|css...)$` — **Why it failed**: nginx treats `{` in an unquoted location argument as block syntax. Fixed by wrapping the regex in double quotes.

- **What was tried** (previous session): Setting `VITE_API_BASE_URL` to the GCP API origin directly — **Why it failed**: Browser CORS policy blocked all requests to the external origin. Fixed by clearing `VITE_API_BASE_URL` and proxying `/bc/*` server-side via nginx `proxy_pass`.

---

## Next Step

**Rebuild the Docker image and redeploy to Cloud Run.** All code changes are final. Run from `C:\claude\rgmc-consignment-webapp` in a terminal where Docker Desktop is accessible:

```powershell
docker build -t gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp .
docker push gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp
gcloud run deploy rgmc-consignment-webapp `
  --image gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp `
  --region asia-southeast1 `
  --platform managed `
  --allow-unauthenticated
```

After deploy, verify end-to-end:
1. Open the Cloud Run URL → splash loads brands + contacts (two green checkmarks)
2. Log in → button shows "Signing in…" then "Loading data…" → navigates to home
3. Tap "Start New Session" → ScanningPage opens with items already loaded (no sync needed)
4. Select or scan an item → confirm sheet slides up with: item info, quantity stepper, discount % / ₱ Amt toggle, grand total in gold, Add to Sales / Add to Return buttons
5. Submit a session → verify sales order and/or return order series numbers appear in the done badges

---

## Context & Gotchas

### Cloud Run details
- **Project ID**: `durable-woods-465907-n1`
- **Service name**: `rgmc-consignment-webapp`
- **Region**: `asia-southeast1`
- **GCP API upstream**: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`

### Items are in-memory, not localStorage
`_itemsMemory` in `storage.service.ts` is a module-level `let`. It persists for the lifetime of the browser tab but is lost on refresh. This is intentional — localStorage's 5 MB quota cannot hold the full items catalog. The login pre-sync and the ScanningPage auto-sync-on-mount together ensure items are always available without user action.

### nginx.conf is a TEMPLATE
`nginx.conf` contains the literal `${PORT}` placeholder. It is copied to `/etc/nginx/nginx.conf.template` in the image. `docker-entrypoint.sh` runs `envsubst '$PORT'` at container startup to produce the real `/etc/nginx/nginx.conf`. Never run nginx directly against the template file.

The `envsubst '$PORT'` (single-quoted) is intentional: it substitutes only `$PORT`, leaving nginx's own `$uri`, `$remote_addr`, `$proxy_add_x_forwarded_for` etc. untouched.

### VITE_API_BASE_URL is baked at build time
It is set to empty in `.env.production`. Vite bakes `import.meta.env.VITE_API_BASE_URL` into the JS bundle as an empty string, so axios makes relative `/bc/*` requests. nginx intercepts these and proxies them to the GCP API. Do NOT set this as a Cloud Run runtime env var — it has no effect on the running container.

### Pre-sync flow on login
`LoginPage.handleLogin()` runs auth then immediately runs `Promise.all([getCustomers, getItems, getItemCategories])`. Sync failure is a silent catch — the user still navigates to `/app/home`. Items land in `_itemsMemory` before the navigation completes, so ScanningPage's `onMounted` auto-sync guard (`if cachedItems.value.length === 0`) is a no-op on fresh login.

### Tab refresh flow
On browser refresh: auth guard redirects to `/splash` → SplashPage detects auth in localStorage → redirects to `/app/home`. No items are in memory (`_itemsMemory = []`). When user navigates to ScanningPage, `onMounted` detects empty items and calls `handleSync()` automatically. The scanning UI shows the "Syncing data…" spinner during this auto-sync, then transitions to the ready state.

### Confirm sheet breakpoint
The confirm sheet uses `breakpoints="[0, 0.92]"` and `initial-breakpoint="0.92"`. This was raised from 0.6 to accommodate the new discount row and grand total. The handle at the top lets users drag it down to dismiss.

### Auth guard race condition (by design)
`router.beforeEach` in `src/main.ts` fires before `authStore.loadFromStorage()` (which runs inside `router.isReady().then()`). Direct URL navigation to `/app/*` always redirects to `/splash`, which loads auth from localStorage and redirects to `/app/home`. Do not move `loadFromStorage()` before the guard.

### localStorage keys (current)
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand: Brand, user: Contact }` |
| `rgmc_cache_brands` | Brand[] |
| `rgmc_cache_contacts` | Contact[] |
| `rgmc_cache_customers` | Slim Customer[] — only {id, number, displayName, city} |
| `rgmc_cache_item_categories` | ItemCategory[] |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISOString }` |
| `rgmc_sessions` | ScanSession[] with `status: 'submitted' \| 'failed'` |
| `rgmc_drafts` | ScanSession[] with `status: 'draft'` |
| ~~`rgmc_cache_items`~~ | **Removed** — items now in `_itemsMemory` only |

### OrderLine type (common bug source)
`OrderLine` has `itemName` (not `itemDisplayName`) and has NO `itemCategoryCode` field. Check `src/types/index.ts` before adding any new code that references order line fields.

### Capacitor not yet initialized
`@capacitor/cli` and `@capacitor/core` are in `package.json` but `npx cap add android/ios` has never been run. No `android/` or `ios/` directories exist. Mobile native build is not set up.
