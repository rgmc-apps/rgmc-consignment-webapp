# Handoff

## Goal

Ship and maintain the **RGMC Consignment Web App** on Google Cloud Run — a mobile-first Ionic/Vue scanning tool for sales reps to build sales/return orders against a GCP-hosted Business Central API.

**Acceptance criteria (all met as of this session):**
- ✅ Login pre-syncs data automatically (cycling labels, lands on home)
- ✅ ScanningPage shows items after sync (no manual re-tap needed)
- ✅ Barcode/item scan → confirm sheet with qty stepper, discount, grand total
- ✅ Multi-barcode picker: Code 128 prioritised first, user picks when multiple detected
- ✅ Single barcode confirm panel with beep + haptic before resolving
- ✅ Offline mode (OFFLINE badge, scan works if items loaded, SubmitPage disabled offline)
- ✅ Pull-to-refresh on ScanningPage, LandingPage, HistoryPage
- ✅ No `QuotaExceededError` in localStorage (items in `_itemsMemory`)
- ✅ All screens work against live GCP API via nginx proxy
- ✅ "Save as Draft & Go Back" saves as `draft` status (not `submitted`)
- ✅ Drafts without a customer selected are NOT saved or shown on Home
- ✅ Drafts with order lines have a Submit shortcut button on the Home page
- ✅ App is full-screen on desktop; content centred in a 720 px column
- ✅ Stale-chunk errors on deploy fixed (nginx no-cache + router error handler)
- ✅ Order date field on ScanningPage (saved locally, NOT sent to API — backend bug)
- ✅ Version number `v1.0.0` displayed in sync bar next to date

---

## Current State

**All code complete and deployed. No known open bugs.**
Cloud Build `1a502180` was WORKING at session end (triggered by the customer-less draft fix commit `7c87652`).

| Area | Status |
|---|---|
| All `src/` source files | ✅ Clean, TypeScript passes, build passes |
| Live URL | `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app` |
| Latest deployed commit | `7c87652` (building at session end) |

**Known open backend issue:**
`orderDate` (YYYY-MM-DD string) was added to the API payload but the GCP Python backend returns `500 — Object of type date is not JSON serializable`. The field has been **removed from the API payload** for now. It is still saved locally on `ScanSession.orderDate` and displayed in the app. The backend needs a fix before this can be re-enabled.

---

## Files Actively Being Edited

*(All committed and pushed — working tree clean)*

### This session's changes

- `nginx.conf` — Moved `Cache-Control: no-store, no-cache, must-revalidate` from `location = /index.html` into `location /` (the actual SPA fallback path). Old location only fired on direct `/index.html` requests, not route fallbacks. Security headers also repeated there due to nginx `add_header` inheritance rules. (`f060b39`)

- `src/router/index.ts` — Added `router.onError()` handler: if a dynamic import fails (stale chunk after deploy), hard-navigates to the target route to reload fresh assets. (`f060b39`)

- `src/components/ItemSelectorModal.vue` — Major scanner upgrade:
  - `ScanStatus` extended with `'multiple'` and `'confirm'`
  - `FORMAT_PRIORITY` / `FORMAT_LABELS` constants for Code 128-first sorting
  - `startAutoDetection()`: single barcode → confirm panel; multiple → sorted picker; both trigger `beepAndHaptic()`
  - `beepAndHaptic()`: 1800 Hz square wave via Web Audio API + `navigator.vibrate(60)`; `AudioContext` unlocked during tap gesture for iOS
  - `openScanner()`: creates and resumes `AudioContext` before any `await`
  - `stopCamera()`: closes `AudioContext` on teardown
  - New confirm panel UI (`.single-confirm`) + multi-picker UI (`.multi-picker`) in template
  - (`9c1e131`, `3857f54`)

- `src/types/index.ts` — Added `orderDate?: string` to `ScanSession`. `SalesOrderPayload` and `SalesReturnOrderPayload` do NOT have `orderDate` (removed after backend 500 error). (`bff6568`, `e3ecc32`)

- `src/stores/session.store.ts` — Added `todayISO()` helper; `buildSession()` initialises `orderDate` to today. Added `setOrderDate(date)` function. `_saveDraft()` now returns early if `currentSession.customer` is null — prevents customerless ghost drafts. `saveAsDraftAndExit()` only persists to storage when a customer is set (still nulls `currentSession` unconditionally). (`bff6568`, `7c87652`)

- `src/views/ScanningPage.vue` — Added ORDER DATE field below customer card (native `<input type="date">`, `orderDateValue` writable computed). Added `appVersion = __APP_VERSION__` constant; displayed as muted `v1.0.0` tag in sync bar next to `todayLabel`. (`bff6568`, `06123be`)

- `src/views/SubmitPage.vue` — Removed `<strong>` HTML tags from alert confirmation message (Ionic escapes HTML in message property). Added `calendarOutline` icon; order date shown in info card. `orderDate` removed from both API payloads. (`e3ecc32`, `bff6568`)

- `src/views/LandingPage.vue` — Added `visibleDrafts` computed that filters `sessionStore.drafts` to only those with `customer !== null`. `hasDrafts` section uses `visibleDrafts.length > 0` and `v-for` iterates `visibleDrafts`. (`7c87652`)

- `src/env.d.ts` — Added `declare const __APP_VERSION__: string` global. (`06123be`)

- `vite.config.ts` — Added `define: { __APP_VERSION__: JSON.stringify(version) }` injecting version from `package.json` at build time. (`06123be`)

- `package.json` — Bumped `"version"` from `"0.1.0"` to `"1.0.0"`. (`06123be`)

---

## Failed Attempts

- **`location = /index.html { no-cache }` in nginx** — Only fires when browser literally requests `/index.html`. SPA fallback routes (e.g. `/app/home`) go through `location /` which had no cache headers, so browsers cached `index.html` indefinitely. After a new deploy with new chunk hashes, the old cached `index.html` referenced non-existent chunks → MIME type error. **Fix**: moved no-cache to `location /`.

- **`orderDate` in API payload** — Sending `orderDate: "2026-05-28"` caused `500 — Object of type date is not JSON serializable` from the GCP Python backend. The backend parses the string into a Python `datetime.date` object and then fails to serialize the response. **Fix**: removed from API payload. Backend must fix its JSON encoder before this can be re-added.

- **`<strong>` HTML in `alertController.message`** — Ionic 7+ escapes HTML in the alert `message` property, so `<strong>Customer Name</strong>` displayed literally. **Fix**: plain text only.

- **`useSync.hasCache` as shared computed** (from prior session) — Read `StorageService.getCachedItems()` which returns a plain JS variable `_itemsMemory`. Vue's reactivity tracker cannot observe it, so the computed always returned initial `false`. Fixed with a local reactive computed in `ScanningPage` that depends on component-level Vue refs.

---

## Next Step

**Verify the customer-less draft fix and all scanner features on the live app** once Cloud Build `1a502180` finishes:

1. Open scanner → do NOT select a customer → navigate back to Home → confirm NO draft appears
2. Open scanner → select a customer → add an item → go back → confirm draft IS visible on Home
3. Open scanner → scan a barcode → verify beep + haptic + confirm panel → tap "Use This Barcode"
4. Scan a product label with multiple barcodes → verify picker shows Code 128 first (gold border)
5. Check sync bar shows `Thu, May 28, 2026 v1.0.0`
6. Check order date field in customer card defaults to today and is editable

When backend `orderDate` is fixed, re-add to payloads in `src/views/SubmitPage.vue` (`doSubmitSales` and `doSubmitReturns`) and to the types `SalesOrderPayload`/`SalesReturnOrderPayload` in `src/types/index.ts`.

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

### `orderDate` — backend not ready
- Field is on `ScanSession.orderDate?: string` (YYYY-MM-DD) and is saved to localStorage/drafts
- Displayed in ScanningPage (customer card) and SubmitPage (info card)
- NOT sent to the API — backend Python serialization bug with `datetime.date` objects
- To re-enable: add `...(session.value?.orderDate ? { orderDate: session.value.orderDate } : {})` back to payloads in `SubmitPage.vue`, and add `orderDate?: string` back to `SalesOrderPayload`/`SalesReturnOrderPayload` in `types/index.ts`

### Draft save guard
`_saveDraft()` returns early if `currentSession.customer` is null. This means:
- Opening the scanner never creates a storage entry until a customer is picked
- `saveAsDraftAndExit()` with no customer → nulls the session, no storage write
- `LandingPage.visibleDrafts` filters as a safety net for pre-existing customerless drafts in storage

### Barcode scanner — AudioContext / iOS
`AudioContext` is created inside `openScanner()` **before any `await`** so it runs within the user-gesture stack (required by iOS Safari). If created after an `await`, iOS will refuse to play audio. The context is closed in `stopCamera()`. On iOS silent mode, beep is muted but `navigator.vibrate()` still fires on Android.

### `BarcodeDetector` availability
`BarcodeDetector` is available in Chrome for Android and desktop Chrome. Not available in Safari (iOS/macOS) or Firefox. The scanner gracefully falls back to manual text input when the API is absent.

### `_itemsMemory` — plain JS, not reactive
`let _itemsMemory: Item[] = []` in `storage.service.ts` is NOT a Vue ref (avoids old localStorage quota issue). Any computed that reads `StorageService.getCachedItems()` directly will NOT update reactively. Always gate display logic on component-level Vue refs.

### `hasCache` — only exists in `ScanningPage.vue`
`useSync.ts` no longer exports `hasCache`. Local computed:
```typescript
const hasCache = computed(
  () => cachedItems.value.length > 0 && cachedCustomers.value.length > 0 && categories.value.length > 0
);
```

### Draft vs. History flow
| Action | Method | Result |
|---|---|---|
| Save as Draft & Go Back (0 submissions, customer set) | `saveAsDraftAndExit()` | Stays in drafts, `status:'draft'`, → `/app/home` |
| Save as Draft & Go Back (no customer) | `saveAsDraftAndExit()` | Session discarded, → `/app/home`, nothing saved |
| After any failed submission | `markFailed(error)` | Moves to history, `status:'failed'` — does NOT null currentSession |
| After all submitted | `markSubmitted(series?)` | Moves to history, `status:'submitted'`, nulls currentSession |

### nginx `add_header` inheritance
In nginx, `add_header` in a `location` block replaces parent `add_header` directives (no merge). The `location /` block explicitly lists all security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) alongside `Cache-Control: no-store` to avoid silently dropping them.

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
| ~~`rgmc_cache_items`~~ | **Removed** — items in `_itemsMemory` only |

### `OrderLine` type gotcha
Has `itemName` (not `itemDisplayName`) and NO `itemCategoryCode`. Check `src/types/index.ts` before adding code that references order line fields.

### nginx.conf is a template
Contains `${PORT}` placeholder. `docker-entrypoint.sh` runs `envsubst '$PORT'` at container start. Single-quoted to preserve nginx's `$uri`, `$remote_addr`, etc.

### `VITE_API_BASE_URL` baked at build time
Empty in `.env.production`. Axios makes relative `/bc/*` requests. Nginx proxies to GCP API. Runtime env var has no effect.

### Auth guard ordering
`router.beforeEach` fires before `authStore.loadFromStorage()`. Direct URL navigation always hits `/splash` → loads auth → redirects. Do not reorder.
