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
- ✅ **PWA Service Worker** — app loads from SW cache when device has no internet (ERR_INTERNET_DISCONNECTED fixed)

---

## Current State

**Working tree has uncommitted UI changes from a multi-session design overhaul.** Latest committed: `8542c2c`.

| Feature | Status |
|---|---|
| Offline toast (device goes offline) | ✅ Done — `App.vue` watch + `toastController` |
| Dark/Light mode toggle | ✅ Done — `useTheme.ts` singleton composable, `data-theme` on `<html>`, persisted to `localStorage` |
| Design overhaul (typography, initials avatars, welcome hero, semantic tokens) | ✅ Done — `variables.css`, `LandingPage.vue`, `ScanningPage.vue`, `HistoryPage.vue` |
| `@property` gold accent system (Direction 3 overdrive) | ✅ Done — 3 animated moments wired up |

**Gold accent system — what was built:**
- `src/composables/useGoldAccent.ts` — module-level singleton, exposes `triggerHeaderPulse`, `triggerSubmitFlash`, `triggerSweep`
- `src/theme/variables.css` — `@property --gold-hdr-glow`, `--gold-submit-glow`, `--gold-sweep-alpha` + 3 keyframes + 3 CSS selectors
- **Trigger 1 (online restore):** `App.vue` calls `triggerHeaderPulse()` when `isOnline` flips false→true → `ion-header.gold-online-pulse` gets a downward gold box-shadow burst via `@property`-animated `--gold-hdr-glow`
- **Trigger 2 (item add):** `ScanningPage.vue` calls `triggerSubmitFlash()` after `doConfirm`, `addToSales`, `addToReturn` → `.submit-bar.gold-item-flash` gets upward gold glow via `@property`-animated `--gold-submit-glow`
- **Trigger 3 (submission success):** `SubmitPage.vue` calls `triggerSweep()` after sales/returns status hits `done` → `v-if="sweepActive"` mounts `.gold-sweep-overlay` (fixed, pointer-events-none, z-index 9999) — a radial-gradient sweep driven by `@property`-animated `--gold-sweep-alpha`
- Degrades silently in browsers without `@property` support (Chrome < 85)
- Already covered by the global `prefers-reduced-motion` rule in `variables.css`

**Changes NOT yet committed (pending since previous sessions):**
- `src/App.vue`
- `src/theme/variables.css`
- `src/composables/useTheme.ts`
- `src/composables/useGoldAccent.ts` (new)
- `src/views/LandingPage.vue`
- `src/views/ScanningPage.vue`
- `src/views/HistoryPage.vue`
- `src/views/SubmitPage.vue`
- `index.html`

Live URL: `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app`
Cloud Build trigger: GitHub push → Cloud Build → Cloud Run (~5 min)

**First-visit SW activation note:** The service worker only takes effect after the first online visit. Users who visited before `8542c2c` was deployed need to load the app once while online — then it will work offline on subsequent visits.

---

## Files Actively Being Edited

All files are committed. Nothing in flight.

### This session's changes (commit `8542c2c`)

- `vite.config.ts` — Added `VitePWA` plugin with `generateSW` mode, `navigateFallback: '/index.html'`, and `/bc/*` excluded from the fallback. `injectRegister: 'auto'` auto-injects `registerSW.js` into the built `index.html`.

- `package.json` — Added `"vite-plugin-pwa": "^1.3.0"` to `devDependencies`.

- `package-lock.json` — Updated lockfile after `npm install -D vite-plugin-pwa`.

- `nginx.conf` — Added a new `location ~* "^/(sw\.js|manifest\.webmanifest|registerSW\.js)$"` block serving those files with `no-store, no-cache` so the browser always checks for SW updates on reload.

### Previous session's changes (commit `9b55dc0`)

- `src/views/ScanningPage.vue` — Save icon button (`saveOutline`) in header `slot="end"`, visible when `selectedCustomer` is set. Calls `saveDraftAndGoHome()`.

- `src/views/SubmitPage.vue` — Inline `<div class="submit-offline-notice">` block in both sales and returns sections, shown `v-if="!isOnline"`.

---

## Failed Attempts

- **Using Bash tool for PowerShell heredoc syntax** — `git commit -m "$(cat <<'EOF'...)"` syntax fails in PowerShell (it's bash-only). Must use PowerShell here-string syntax: `git commit -m @'...'@` with closing `'@` at column 0.

- **Staging `dist/` after .gitignore was updated** — `git add dist/` fails with "The following paths are ignored by one of your .gitignore files". Correct: `dist/` is in `.gitignore` (added in `baac605`), and the Dockerfile builds fresh — no need to commit `dist/`.

---

## Next Step

**Commit and deploy the UI overhaul.** All changes are complete, TypeScript is clean (zero errors), logic is sound.

Suggested commit message: "feat: dark mode, typography system, and @property gold accent animations"

After pushing, verify in the live app:
1. Dark/light toggle persists across page refresh
2. Going offline shows the toast; coming back online pulses the header gold
3. Adding an item in ScanningPage → submit bar briefly glows gold
4. Submitting an order → radial gold sweep sweeps across SubmitPage

If the gold effects don't appear: check browser is Chromium-based (Chrome 85+ or Edge 85+); `@property` is not yet supported in Safari < 16.4.

---

## Context & Gotchas

### Deployment
- **GitHub push → Cloud Build trigger → Cloud Run** (~5 min)
- Project: `durable-woods-465907-n1` | Service: `rgmc-consignment-webapp` | Region: `asia-southeast1`
- GCP API: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`
- Dockerfile always runs `npm run build` — `dist/` in git is irrelevant (and now .gitignored)

### PWA / Service Worker
- `vite-plugin-pwa` v1.3.0 installed as dev dep
- `generateSW` mode (default) — Workbox auto-generates `sw.js` and `workbox-[hash].js` at build time
- Pre-caches 32 entries (~2.8 MB) covering all JS/CSS chunks and assets
- `navigateFallback: '/index.html'` makes all SPA routes work offline
- `navigateFallbackDenylist: [/^\/bc\//]` — API proxy calls bypass the fallback (they fail gracefully offline)
- `registerType: 'autoUpdate'` — new SW activates silently in background; user gets new version on next page load
- `cleanupOutdatedCaches: true` — removes stale pre-cache entries from old deploys
- The SW only activates after the FIRST online visit. Users must load the app once online before offline mode works
- `sw.js`, `manifest.webmanifest`, `registerSW.js` are served `no-cache` by nginx so the browser always checks for SW updates

### nginx `add_header` inheritance
- `add_header` in a `location` block replaces parent directives (no merge)
- `location /` explicitly lists all security headers + `Cache-Control: no-store`
- New `location ~* "^/(sw\.js|manifest\.webmanifest|registerSW\.js)$"` block added above the hashed-assets block — nginx uses the most specific match, so `sw.js` hits this block, NOT the hashed assets block
- `nginx.conf` contains `${PORT}` placeholder — `docker-entrypoint.sh` runs `envsubst '$PORT'`

### Version number
- Defined in `package.json → version`
- Injected at build time by Vite: `define: { __APP_VERSION__: JSON.stringify(version) }`
- To bump: change `"version"` in `package.json`, push, redeploy — no code changes needed
- Declared as `const __APP_VERSION__: string` in `src/env.d.ts` for TypeScript

### `orderDate` — sent to API
- Field is on `ScanSession.orderDate?: string` (YYYY-MM-DD), saved to localStorage/drafts
- Sent to API in both `SalesOrderPayload` and `SalesReturnOrderPayload` as optional field

### API endpoints
- Sales orders: `POST /bc/sales-orders`
- Sales return orders: `POST /bc/custom/sales-return-orders` (note `custom/` namespace)
- All other read endpoints: `GET /bc/*` (standard namespace)

### Items — IndexedDB persistence
- `_itemsMemory` (module-level JS var) is the in-session store — lost on tab refresh
- `StorageService.setCachedItems()` fire-and-forgets an IDB write to `rgmc-cache` DB, `items` object store, key `'all'`
- `StorageService.init()` reads from IDB → populates `_itemsMemory` — call this at startup
- `StorageService.init()` is idempotent (stores a `_initPromise`, safe to call multiple times)
- Called in: `App.vue` (root mount), `SplashPage.vue` (before cache check), `ScanningPage.vue` (before refreshCache)

### Offline navigation flow
- `main.ts` `router.beforeEach`: redirects unauthenticated users to `/splash`
- `router.isReady().then(...)` loads auth + session from localStorage BEFORE `app.mount()`
- `SplashPage.onMounted`: awaits `StorageService.init()`, then checks auth + cache:
  - `authStore.isAuthenticated && customers.length > 0 && items.length > 0 && categories.length > 0` → skip network → `/app/home`
  - Otherwise → calls `load()` (brands + contacts from network)
- The SW handles the browser-level "can't reach server" case; the SplashPage cache check handles "server reachable but we want to skip the sync"

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
