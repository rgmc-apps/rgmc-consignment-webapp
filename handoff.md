# Handoff

## Goal

Ship and maintain the **RGMC Consignment Web App** on Google Cloud Run — a mobile-first Ionic/Vue scanning tool for sales reps to build sales/return orders against a GCP-hosted Business Central API.

**Acceptance criteria (all met as of this session):**
- ✅ Login pre-syncs ALL data automatically (customers, items, categories, brands, contacts)
- ✅ ScanningPage shows items after sync (no manual re-tap needed)
- ✅ Barcode/item scan → confirm sheet with qty stepper, discount, grand total
- ✅ Multi-barcode picker: Code 128 prioritised first, user picks when multiple detected
- ✅ Single barcode confirm panel with beep + haptic before resolving
- ✅ Offline mode (OFFLINE badge, scan works if items loaded, SubmitPage disabled offline)
- ✅ Pull-to-refresh on ScanningPage, LandingPage, HistoryPage
- ✅ No `QuotaExceededError` in localStorage (items in `_itemsMemory` + IndexedDB)
- ✅ All screens work against live GCP API via nginx proxy
- ✅ "Save as Draft & Go Back" saves as `draft` status (not `submitted`)
- ✅ Drafts without a customer selected are NOT saved or shown on Home
- ✅ Drafts with order lines have a Submit shortcut button on the Home page
- ✅ App is full-screen on desktop; content centred in a 720 px column
- ✅ Stale-chunk errors on deploy fixed (nginx no-cache + router error handler)
- ✅ Order date field on ScanningPage (saved locally, sent to API)
- ✅ Version number `v1.0.0` displayed in sync bar next to date
- ✅ Sales return order endpoint fixed (`/bc/custom/sales-return-orders`)
- ✅ Items persisted to IndexedDB — offline scanning survives browser refresh
- ✅ Full offline navigation — SplashPage bypasses network if auth + cache exist
- ✅ Submit buttons disabled + inline notice when offline
- ✅ "Save as Draft" icon in ScanningPage header (when customer selected)

---

## Current State

**Two changes are complete and TypeScript-clean but NOT yet committed (user interrupted both commits):**

| File | Change | State |
|---|---|---|
| `src/views/ScanningPage.vue` | Save-as-draft icon button in header | ✅ Complete, uncommitted |
| `src/views/SubmitPage.vue` | Inline offline notice below each submit button | ✅ Complete, uncommitted |

**All other changes pushed to `origin/master`. Latest pushed commit: `cb00564`.**

Live URL: `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app`
Cloud Build trigger: GitHub push → Cloud Build → Cloud Run (~5 min)

---

## Files Actively Being Edited

### Uncommitted (need a commit before next work)

- `src/views/ScanningPage.vue` — Save icon button (`saveOutline`) added to header `slot="end"` toolbar, visible only when `selectedCustomer` is set. Calls `saveDraftAndGoHome()` → `sessionStore.saveAsDraftAndExit()` + `router.replace('/app/home')`. Added `useRouter` import, `saveOutline` icon import, `router` const, and `saveDraftAndGoHome` function.

- `src/views/SubmitPage.vue` — Added `<div class="submit-offline-notice">` block inside both `.submit-action` divs (sales and returns), shown with `v-if="!isOnline"`. Added `.submit-offline-notice` CSS style. The buttons were already disabled via `!isOnline`; this adds a contextual warning chip explaining why.

### This session's committed changes

- `src/services/api.service.ts` — Return order endpoint: `/bc/sales-return-orders` → `/bc/custom/sales-return-orders` (singular path was wrong; correct path confirmed by user). (`baac605`)

- `src/types/index.ts` — Added `orderDate?: string` to `SalesOrderPayload` and `SalesReturnOrderPayload`. (`baac605`)

- `src/views/SubmitPage.vue` — Added `orderDate` spread into both `doSubmitSales` and `doSubmitReturns` payloads: `...(session.value?.orderDate ? { orderDate: session.value.orderDate } : {})`. (`baac605`)

- `.gitignore` — Expanded from `node_modules` only to cover: `dist/`, `.env.local`, `*.local`, `*.log`, `.DS_Store`, `Thumbs.db`, `.claude/`, `handoff.md`, `screenshots/`, `screenshot-tour.js`. Note: `dist/` and `handoff.md` are still tracked in git (need `git rm --cached` to untrack). (`baac605`)

- `src/services/storage.service.ts` — Added IndexedDB persistence for items: `openItemsIDB()`, modified `setCachedItems()` to fire-and-forget IDB write, added `loadCachedItemsAsync()`, added `init()` (idempotent startup loader). (`fc84bd9`)

- `src/composables/useSync.ts` — Expanded `sync()` to include `getBrands()` + `getContacts()` alongside customers/items/categories. Full offline prep on every sync. (`fc84bd9`)

- `src/views/LoginPage.vue` — Removed ~20 lines of inline sync code; replaced with `useSync().sync()` call. Kept cycling label messages (watch on `isSyncing` still works). (`fc84bd9`)

- `src/views/ScanningPage.vue` — Added `await StorageService.init()` before `refreshCache()` in `onMounted` so IDB items are restored before the empty-cache check. (`fc84bd9`)

- `src/App.vue` — Added `onMounted(() => { StorageService.init(); })` to kick off IDB preload at root mount. (`fc84bd9`)

- `src/views/SplashPage.vue` — `onMounted` now awaits `StorageService.init()`, then checks if auth + all three cache types (customers, items, categories) are present. If so, skips all network calls and navigates directly to `/app/home`. Normal `load()` only runs for first-time users or incomplete cache. (`cb00564`)

---

## Failed Attempts

- **Return order endpoint `/bc/sales-return-order` (singular)** — User initially guessed singular; tried it; turned out the correct endpoint is `/bc/custom/sales-return-orders` (custom namespace, plural). Fixed in `baac605`.

- **`orderDate` in API payloads (prior session)** — Sending `orderDate: "2026-05-28"` caused `500 — Object of type date is not JSON serializable` from the GCP Python backend. Was removed. This session the backend issue was resolved on the backend side, so `orderDate` was re-added to both payloads.

- **Duplicate `useRouter` import in SplashPage** — While editing SplashPage to add offline bypass, accidentally added a second `import { useRouter } from 'vue-router'` and removed the `const router = useRouter()` line. Fixed by removing duplicate import and restoring the const.

---

## Next Step

**Commit the two pending changes** then push:

```
git add src/views/ScanningPage.vue src/views/SubmitPage.vue
git commit -m "feat: save-as-draft button in scan header + offline notice on submit buttons"
git push origin master
```

After that, verify on the live app (Cloud Build ~5 min after push):
1. Go offline → open app → confirm it goes straight to Home (not stuck on splash retry)
2. On SubmitPage offline → confirm both submit buttons show the amber "You're offline" chip
3. On ScanningPage with a customer selected → confirm save icon appears in header → tap it → confirm draft saved and navigated to Home

---

## Context & Gotchas

### Deployment
- **GitHub push → Cloud Build trigger → Cloud Run** (~5 min)
- Project: `durable-woods-465907-n1` | Service: `rgmc-consignment-webapp` | Region: `asia-southeast1`
- GCP API: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`
- Dockerfile always runs `npm run build` — committed `dist/` is irrelevant

### Version number
- Defined in `package.json → version`
- Injected at build time by Vite: `define: { __APP_VERSION__: JSON.stringify(version) }`
- To bump: change `"version"` in `package.json`, push, redeploy — no code changes needed
- Declared as `const __APP_VERSION__: string` in `src/env.d.ts` for TypeScript

### `orderDate` — now sent to API
- Field is on `ScanSession.orderDate?: string` (YYYY-MM-DD), saved to localStorage/drafts
- Displayed in ScanningPage (customer card) and SubmitPage (info card)
- Sent to API in both `SalesOrderPayload` and `SalesReturnOrderPayload` as optional field
- Backend fix was applied this session; re-enabled in `baac605`

### API endpoints
- Sales orders: `POST /bc/sales-orders`
- Sales return orders: `POST /bc/custom/sales-return-orders` (note `custom/` namespace)
- All other read endpoints: `GET /bc/*` (standard namespace)

### Items — IndexedDB persistence
- `_itemsMemory` (module-level JS var) is the in-session store — lost on tab refresh
- `StorageService.setCachedItems()` now fire-and-forgets an IDB write to `rgmc-cache` DB, `items` object store, key `'all'`
- `StorageService.init()` reads from IDB → populates `_itemsMemory` — call this at startup
- `StorageService.init()` is idempotent (stores a `_initPromise`, safe to call multiple times)
- Called in: `App.vue` (root mount), `SplashPage.vue` (before cache check), `ScanningPage.vue` (before refreshCache)

### Offline navigation flow
- `main.ts` `router.beforeEach`: redirects unauthenticated users to `/splash`
- `router.isReady().then(...)` loads auth + session from localStorage BEFORE `app.mount()`
- `SplashPage.onMounted`: awaits `StorageService.init()`, then checks auth + cache:
  - `authStore.isAuthenticated && customers.length > 0 && items.length > 0 && categories.length > 0` → skip network → `/app/home`
  - Otherwise → calls `load()` (brands + contacts from network)
- Tab navigation (Home/Scan/History) has no additional guards — works freely when authenticated

### Draft save guard
- `_saveDraft()` returns early if `currentSession.customer` is null (no ghost drafts)
- `saveAsDraftAndExit()` with no customer → nulls session, no storage write
- `LandingPage.visibleDrafts` filters as a safety net for any pre-existing customerless drafts

### Barcode scanner — AudioContext / iOS
- `AudioContext` created inside `openScanner()` BEFORE any `await` — required by iOS Safari
- Closed in `stopCamera()`; `navigator.vibrate(60)` still fires on Android silent mode
- `BarcodeDetector` not available in Safari/Firefox — falls back to manual text input

### `_itemsMemory` — not reactive
- Plain JS var invisible to Vue's reactivity tracker
- `hasCache` in ScanningPage is a local computed depending on `cachedItems` ref
- `refreshCache()` must be called explicitly after sync to update the component refs

### Draft vs. History flow
| Action | Method | Result |
|---|---|---|
| Save as Draft & Go Back (customer set) | `saveAsDraftAndExit()` | Stays in drafts, `status:'draft'`, → `/app/home` |
| Save as Draft & Go Back (no customer) | `saveAsDraftAndExit()` | Session discarded, → `/app/home`, nothing saved |
| After any failed submission | `markFailed(error)` | Moves to history, `status:'failed'` |
| After all submitted | `markSubmitted(series?)` | Moves to history, `status:'submitted'`, nulls currentSession |

### nginx `add_header` inheritance
- `add_header` in a `location` block replaces parent directives (no merge)
- `location /` explicitly lists all security headers + `Cache-Control: no-store`
- `nginx.conf` contains `${PORT}` placeholder — `docker-entrypoint.sh` runs `envsubst '$PORT'`

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand, user }` |
| `rgmc_cache_brands` | Brand[] |
| `rgmc_cache_contacts` | Contact[] |
| `rgmc_cache_customers` | Slim `{id,number,displayName,city}` |
| `rgmc_cache_item_categories` | ItemCategory[] |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISO }` |
| `rgmc_sessions` | ScanSession[] `status:'submitted'\|'failed'` |
| `rgmc_drafts` | ScanSession[] `status:'draft'` (customerless entries filtered on display) |
| ~~`rgmc_cache_items`~~ | **Removed** — items in `_itemsMemory` + IndexedDB `rgmc-cache` |

### `OrderLine` type gotcha
- Has `itemName` (not `itemDisplayName`) and NO `itemCategoryCode`
- Check `src/types/index.ts` before adding code that references order line fields

### `VITE_API_BASE_URL` baked at build time
- Empty in `.env.production` — Axios makes relative `/bc/*` requests — nginx proxies to GCP API
- Runtime env var has no effect

### Auth guard ordering
- `router.beforeEach` fires during initial navigation (before `loadFromStorage`)
- `loadFromStorage()` is called inside `router.isReady().then(...)` BEFORE `app.mount()`
- So by the time any page component's `onMounted` runs, auth is correctly hydrated
