# Handoff

## Goal

Ship the **RGMC Consignment Web App** to production on Google Cloud Run. All application code is complete and type-clean. The remaining work is to commit this session's changes and rebuild + redeploy the Docker image.

**Acceptance criteria:**
- App loads at the Cloud Run URL
- Login pre-syncs data automatically (button cycles through sync labels, then lands on a ready home screen)
- ScanningPage has items available without requiring a manual sync tap
- Barcode/item scan → confirm sheet with quantity stepper, discount selector, grand total, Add to Sales/Return buttons
- Scanning works when offline if items were loaded before going offline (OFFLINE badge visible in header)
- SubmitPage submit buttons are disabled when offline; re-enable on reconnect
- Pull-to-refresh gesture works on ScanningPage (triggers sync), Home, and History
- No `QuotaExceededError` in localStorage for items
- All six screens function against the live GCP API via nginx proxy (no CORS errors)

---

## Current State

**All application code: COMPLETE AND TYPE-CLEAN.** `vue-tsc --noEmit` exits 0.

**Cloud Run deployment: STALE.** The running container is behind — it does not include any of the changes from this session. A commit + fresh build + deploy is required.

| Area | Status |
|---|---|
| All `src/` source files | ✅ Complete, TypeScript clean |
| `vite build` | ✅ Passes |
| `Dockerfile` + `nginx.conf` + `docker-entrypoint.sh` | ✅ Fixed (previous session) |
| `.env.production` | ✅ `VITE_API_BASE_URL` empty — nginx proxy handles `/bc/*` |
| `storage.service.ts` — items in-memory | ✅ Committed (`9cabbf6`) |
| Cycling sync messages (LoginPage + ScanningPage) | ✅ Coded, **NOT committed** |
| Network status notice (offline/slow banner) | ✅ Coded, **NOT committed** |
| Offline mode (badge + scan works offline + SubmitPage guard) | ✅ Coded, **NOT committed** |
| Pull-to-refresh (ScanningPage, LandingPage, HistoryPage) | ✅ Coded, **NOT committed** |
| `README.md` | ✅ Written this session |
| Cloud Run deployment | ⏳ **Needs commit + rebuild + redeploy** |

---

## Files Changed This Session (all uncommitted)

### New file

- `src/composables/useNetworkStatus.ts` — `useNetworkStatus()` composable. Exposes `isOnline` (tracks `window online`/`offline` events via `navigator.onLine`) and `isSlowConnection` (reads `navigator.connection.effectiveType`, considers `'slow-2g'` and `'2g'` as slow). Registers and cleans up all event listeners in `onMounted`/`onUnmounted`.

### Modified files

- **`src/views/LoginPage.vue`**
  - Added `syncBtnMessages` array + `syncBtnIndex` ref + `syncBtnTimer` interval: button label cycles every 5 s while `isSyncing` is true ("Loading data…" → "Fetching items…" → "Loading customers…" → "Preparing app…" → "Almost ready…")
  - Added `useNetworkStatus` — `{ isOnline, isSlowConnection }`
  - Added `isSyncingSlow` ref: set to true after 10 s of syncing, cleared when sync ends
  - Added `networkNotice` computed: `'offline'` | `'slow'` | `null`
  - Template: amber network notice div between logo block and login card (uses `cloudOfflineOutline` / `warningOutline`); fades in/out with CSS transition

- **`src/views/ScanningPage.vue`**
  - Added `syncMessages` array + `syncMsgIndex` ref + `syncMsgTimer` interval: state card text cycles every 5 s during sync
  - Added `isSyncingSlow` ref + `syncSlowTimer` (10 s timeout): triggers amber "slow" notice
  - Added `useNetworkStatus` — `{ isOnline, isSlowConnection }`
  - Added `networkNotice` computed: `'offline'` | `'slow'` | `null`
  - Added `onPullRefresh(ev)`: calls `handleSync()` if online, always calls `ev.target.complete()`
  - Sync button: `disabled="isSyncing || !isOnline"`
  - Sync-bar: shows amber `OFFLINE` pill badge (with `cloudOfflineOutline`) when `!isOnline`, otherwise shows the today label; transitions between them
  - Network notice template: offline copy is context-aware — "Offline Mode / Scanning available…" when items are loaded, "No Connection / Connect to load items…" when not
  - No-cache state card: new `!isOnline` branch ("Offline — no data loaded"), sync button hidden when offline
  - `IonRefresher` + `IonRefresherContent` added inside `ion-content`
  - Offline notice CSS uses warning/amber (not danger/red) to signal limited-but-functional mode

- **`src/views/SubmitPage.vue`**
  - Added `useNetworkStatus` — `{ isOnline }`
  - Added `cloudOfflineOutline` to icon imports
  - Offline notice card at top of content (amber, fades in/out)
  - Both submit buttons: `disabled="… || !isOnline"`

- **`src/views/LandingPage.vue`**
  - Added `IonRefresher`, `IonRefresherContent` to Ionic imports
  - Added `onPullRefresh(ev)`: re-reads `StorageService.getCachedCustomers()` + calls `sessionStore.loadFromStorage()`, then completes
  - `IonRefresher` added inside `ion-content`

- **`src/views/HistoryPage.vue`**
  - Added `IonRefresher`, `IonRefresherContent` to Ionic imports
  - Added `onPullRefresh(ev)`: calls `sessionStore.loadFromStorage()`, then completes
  - `IonRefresher` added inside `ion-content`

---

## Failed Attempts (all sessions)

- **localStorage items storage** — localStorage has a hard 5 MB per-origin cap. Even with 6-field slimming + 120-char description truncation, the GCP items catalog exceeded it. Fixed: items now live in `_itemsMemory` (module-level JS variable) — never written to localStorage.
- **Inline `envsubst` in Dockerfile** — `CMD envsubst '$PORT' < template > config && nginx` was unreliable in Alpine busybox sh; nginx ran as child of sh, not PID 1. Fixed with `docker-entrypoint.sh`.
- **Unquoted nginx regex braces** — `location ~* \.[0-9a-f]{8}\.(js|css...)$` caused nginx startup failure because nginx treats `{` in unquoted regex as block syntax. Fixed by wrapping the regex in double quotes.
- **Setting `VITE_API_BASE_URL` to GCP origin** — Browser CORS policy blocked all requests. Fixed by leaving `VITE_API_BASE_URL` empty and proxying `/bc/*` server-side via nginx `proxy_pass`.

---

## Next Step

**Commit all changes, then rebuild and redeploy.**

```powershell
# 1. Commit
git add src/composables/useNetworkStatus.ts `
        src/views/LoginPage.vue `
        src/views/ScanningPage.vue `
        src/views/SubmitPage.vue `
        src/views/LandingPage.vue `
        src/views/HistoryPage.vue `
        README.md handoff.md
git commit -m "add cycling sync messages, offline mode, network notices, pull-to-refresh"

# 2. Build + push + deploy (requires Docker Desktop + gcloud auth)
docker build -t gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp .
docker push gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp
gcloud run deploy rgmc-consignment-webapp `
  --image gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp `
  --region asia-southeast1 `
  --platform managed `
  --allow-unauthenticated
```

---

## Context & Gotchas

### Cloud Run details
- **Project ID**: `durable-woods-465907-n1`
- **Service name**: `rgmc-consignment-webapp`
- **Region**: `asia-southeast1`
- **GCP API upstream**: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`

### Items are in-memory, not localStorage
`_itemsMemory` in `storage.service.ts` is a module-level `let`. It persists for the lifetime of the browser tab but is lost on refresh. This is intentional — localStorage's 5 MB quota cannot hold the full items catalog. The login pre-sync and the ScanningPage auto-sync-on-mount together ensure items are always available without user action.

### Offline mode requires items to already be in memory
`useNetworkStatus.isOnline` is reactive — the UI updates the moment the device goes offline/online. But if `_itemsMemory` is empty when the device goes offline, scanning is blocked (state card shows "Offline — no data loaded"). The user must reconnect and sync once before losing connectivity.

### nginx.conf is a TEMPLATE
`nginx.conf` contains the literal `${PORT}` placeholder. It is copied to `/etc/nginx/nginx.conf.template` in the image. `docker-entrypoint.sh` runs `envsubst '$PORT'` at container startup to produce the real `/etc/nginx/nginx.conf`. Never run nginx directly against the template file.

The `envsubst '$PORT'` (single-quoted) is intentional: it substitutes only `$PORT`, leaving nginx's own `$uri`, `$remote_addr`, `$proxy_add_x_forwarded_for` etc. untouched.

### VITE_API_BASE_URL is baked at build time
It is set to empty in `.env.production`. Vite bakes `import.meta.env.VITE_API_BASE_URL` into the JS bundle as an empty string, so axios makes relative `/bc/*` requests. nginx intercepts these and proxies them to the GCP API. Do NOT set this as a Cloud Run runtime env var — it has no effect on the running container.

### Pre-sync flow on login
`LoginPage.handleLogin()` runs auth then immediately runs `Promise.all([getCustomers, getItems, getItemCategories])`. Sync failure is a silent catch — the user still navigates to `/app/home`. Items land in `_itemsMemory` before the navigation completes, so ScanningPage's `onMounted` auto-sync guard (`if cachedItems.value.length === 0`) is a no-op on fresh login.

### Tab refresh flow
On browser refresh: auth guard redirects to `/splash` → SplashPage detects auth in localStorage → redirects to `/app/home`. No items are in memory (`_itemsMemory = []`). When user navigates to ScanningPage, `onMounted` detects empty items and calls `handleSync()` automatically. The scanning UI shows cycling sync messages during this auto-sync, then transitions to the ready state.

### Pull-to-refresh behaviour per page
- **ScanningPage**: triggers `handleSync()` if online; completes immediately if offline (no-op)
- **LandingPage**: re-reads customers from `StorageService` + calls `sessionStore.loadFromStorage()`
- **HistoryPage**: calls `sessionStore.loadFromStorage()` only

### Confirm sheet breakpoint
The confirm sheet uses `breakpoints="[0, 0.92]"` and `initial-breakpoint="0.92"`. The handle at the top lets users drag it down to dismiss.

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
