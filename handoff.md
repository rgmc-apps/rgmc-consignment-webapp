# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, data accuracy, and reliability — correct item prices, stable sync, and responsive UI.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos are clean and committed on `master`. TypeScript passes (`vue-tsc --noEmit` zero errors). No broken state.**

### What was done this session (4 tasks):

**Task 1 — Removed dead `getItemFamilies` fetch from sync**
`useSync.ts` Phase 3 was fetching item families but never storing the result (no `setCachedItemFamilies` in StorageService). Removed the fetch and dropped 'Item Families' subtask. Sync now has 4 subtasks: Customers, Item Categories, Items & Prices, Contacts.

**Task 2 — Removed `itemId` from `OrderLine` and form**
`OrderLine.itemId` was storing `item.id` (a system GUID from `systemId ?? id ?? number`) but was only used as a presence/truthy check — `itemNumber` (BC product number) already served that purpose. Removed `itemId` from `types/index.ts`, `ScanForm` interface, form initialiser, `onItemSelected`, `doConfirm`, `addToSales`, `addToReturn`, and `resetItemForm`. All presence checks now use `form.itemNumber`.

**Task 3 — Added `priceListCode` display across scan page**
The v3 item-prices endpoint (`Pag50318`) already returns `priceListCode` on every row. Wired it end-to-end:
- `Item.priceListCode?: string` and `OrderLine.priceListCode?: string` added to `types/index.ts`
- `getItemsForDate` maps `row['priceListCode']`
- `getActiveItemPrice` return type changed from `Promise<number | null>` to `Promise<{ price: number | null; priceListCode: string | null }>`
- `lookupPrice` in ScanningPage updated to match; `fetchActivePrice` also sets `form.priceListCode` and `confirmedPriceListCode`
- `onItemSelected` seeds `form.priceListCode` and `confirmedPriceListCode` immediately from item data (before async fetch resolves)
- `doConfirm`, `addToSales`, `addToReturn` pass `priceListCode` into `OrderLine`
- Template: small `.price-list-code` chip appears next to price in SRP form row, confirm modal, and order line list

**Task 4 — Fixed v3 item-prices endpoint timeout resilience**

*Backend (`bc_functions.py`):*
- Added `_find_any_full_catalog_cache(company_name)` — finds any cached full catalog for a company regardless of `on_date` (used as stale fallback)
- Added `_any_full_catalog_warming(company_name)` — checks if any background thread is fetching a full catalog for this company
- Rewrote `rgmc_v3_list_item_prices` with 6-step cache strategy:
  1. Exact key, fresh → return immediately
  2. Exact key, stale → return + background refresh
  3. Full-catalog path: check any date's catalog as stale fallback + trigger refresh
  4. Warmup wait extended 30s → 90s; waits for any full-catalog warmup (not just exact date)
  5. `product_no` single-item lookups check full-catalog cache first before going to BC
  6. Synchronous BC fetch as last resort only

*Backend (`main.py`):*
- `rgmc_v3_warmup` moved to run immediately after `warmup_company_id` (second in startup sequence, before all other list warmups) — the v3 price cache is the most critical and slowest; warming it first means it's ready sooner.

*Frontend (`api.service.ts`):*
- `getItemsForDate` now retries up to 2× on 5xx/timeout errors (5s backoff, doubles to 20s max). Aborts on 4xx or AbortError.

*Frontend (`useSync.ts`):*
- Phase 2 is now non-fatal when cached items exist. On failure: sets subtask to 'error', returns `null`, continues to Phase 3 (contacts). Warning message is shown. Only hard-fails when `StorageService.getCachedItems().length === 0` (first-ever sync on a fresh device).

---

## Files Actively Being Edited

All committed and stable. No mid-edit state.

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `types/index.ts` — `Item.priceListCode?: string` added (line 75); `OrderLine.priceListCode?: string` added (line 95); `OrderLine.itemId` removed
- `services/api.service.ts` — `getItemsForDate` retry loop; `priceListCode` mapped in `mapRow`; `getActiveItemPrice` returns `{ price, priceListCode }`
- `composables/useSync.ts` — 4 subtasks; Phase 2 non-fatal with `null` return + cached fallback
- `views/ScanningPage.vue` — `ScanForm.priceListCode: string`, `confirmedPriceListCode = ref('')`; `.price-list-code` chip CSS; all `form.itemId` / `itemId` references removed

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `services/bc_functions.py` — `_find_any_full_catalog_cache`, `_any_full_catalog_warming` helpers; `rgmc_v3_list_item_prices` rewritten
- `main.py` — v3 warmup order moved earlier

---

## Failed Attempts

No dead ends this session. From prior sessions (still relevant):
- **OData OR filter with many product numbers** → HTTP 414 (URL too long); chunk approach used instead
- **Loading all prices unfiltered in one call** → 60s Axios timeout; batching + caching solved it
- **`watch(displayItems)` for initial price load in ItemSelectorModal** → Does NOT fire on initial render; `onMounted` explicit call required
- **Pre-fetching all item prices before modal opens in ScanningPage** → Reverted (over-engineered); batching inside modal on mount with chunk size 150 is sufficient
- **`familyCode` OData filter on BC temp-table page** → BC applies OData filters AFTER `OnOpenPage` builds the buffer, so `$filter=familyCode eq 'CODE'` doesn't reduce BC's work; fixed in AL (Pag50318) and backend filters in Python from full-catalog cache

---

## Next Step

Online/Offline mode separation is implemented (see "What was done" below). Good verification steps:

1. **Test mode toggle** — Open login page. Confirm toggle appears between brand dropdown and username. Toggle to Online → sync panel should NOT appear after login, user goes straight to app. Toggle to Offline → sync panel appears during login.

2. **Test offlineReady badge** — On a fresh device (no cache), confirm "sync required" tag shows in offline mode. After a full offline sync, confirm "ready" green badge appears.

3. **Test online mode item selector** — Log in as Online mode, open the scan page, tap item selector. Confirm items load from API (spinner then list). Confirm categories auto-populate from loaded items.

4. **Test pagination endpoint** — Call `GET /bc/custom/v3/item-prices?family_code=X&skip=0&limit=10` — should return `{ data: [...10 items], total: N, skip: 0, limit: 10 }`.

5. **Test layer 2 (GCP queue)** — See `gcp-implementation.md` for full setup. Not yet implemented in code.

---

## What Was Done This Session (5 tasks after layer 1):

**Online/Offline Mode Separation:**

*New file (`src/stores/app-mode.store.ts`):*
- Module-level singleton: `mode: ref<'online' | 'offline'>` (default 'offline', persisted to `rgmc_app_mode` localStorage key)
- `offlineReady: computed` — true when `getCachedItems().length > 0 && getCachedCustomers().length > 0`
- `setMode(m)` function

*`LoginPage.vue`:*
- Added `IonToggle` import; added `wifiOutline`, `cloudDoneOutline` icons
- Added `useAppModeStore()` — `mode`, `offlineReady`, `setMode`
- Added `onModeToggle()` function
- Mode toggle row in template (between brand dropdown and username): shows online/offline icon, title, hint with "ready" or "sync required" badge
- Sync panel now gated with `mode === 'offline'`: `v-if="loginState === 'success' && isSyncing && mode === 'offline'"`
- Added "Preparing offline mode" label above sync status header
- `handleLogin()`: skips `await sync()` in online mode
- New CSS: `.mode-toggle-row`, `.mode-ready-tag`, `.mode-sync-tag`, `.mode-toggle`, `.sync-status-mode-label`

*`bc-api/src/routers/bc_routes/rgmc_item_price_v3_routes.py`:*
- Added `from pydantic import BaseModel`
- Added `ItemPricePage` Pydantic model (data, total, skip, limit)
- Added `skip: int = Query(0, ge=0)` and `limit: int = Query(0, ge=0)` params to `list_item_prices`
- Route now slices results: `records = records[skip:skip+limit]` when `limit > 0`
- Response now always includes `total`, `skip`, `limit` alongside `data`

*`api.service.ts`:*
- Extracted `mapItemRow(row)` module-level helper (was inline in `getItemsForDate`)
- `getItemsForDate` now uses `mapItemRow`
- New `getItemsPage(date, familyCode?, skip=0, limit=0, signal?)` method → `{ items, priceMap, total }`; reads `body.total` for pagination metadata

*`ItemSelectorModal.vue`:*
- Added `familyCode?: string` prop
- Added `useAppModeStore` import; `const { mode } = useAppModeStore()`
- Added `onlineItems: ref<Item[]>([])` and `isLoadingOnline: ref(false)`
- `effectiveItems` computed: `mode === 'online' ? onlineItems : props.items`
- `effectiveCategories` computed: in online mode, derives categories from loaded item data; offline uses `props.categories`
- `filteredItems` now filters against `effectiveItems` instead of `props.items`
- Category chips now iterate `effectiveCategories`
- `onMounted`: in online mode → calls `ApiService.getItemsPage(date, familyCode)` and populates `onlineItems` + `livePrices`; in offline mode → existing cache + `fetchMissingPrices` flow
- Added "Loading items from server…" spinner banner for online mode

*`ScanningPage.vue`:*
- Added `useAppModeStore` import; `const { mode: appMode } = useAppModeStore()`
- Passes `:family-code="authStore.brand?.code"` to `<item-selector-modal>`
- Auto-sync on mount now gated: `cachedItems.length === 0 && isOnline && appMode === 'offline'`

---

---

## Previous Verification Steps (still relevant)

1. **Test `priceListCode` display** — Open scan page, select an item, confirm the price list code chip appears in: (a) the SRP form row, (b) the confirm modal, (c) after adding to the order line list. Also verify it shows after `fetchActivePrice` overwrites the initial seeded value.

2. **Test sync fallback on items timeout** — Temporarily block the bc-api or kill it after Phase 1 completes to simulate Phase 2 failure. Confirm: sync completes to 100%, warning banner shows "Item prices couldn't be refreshed", item list is still populated from cache.

3. **Test cross-date cache fallback (backend)** — After warmup with today's date, request `/bc/custom/v3/item-prices?on_date=YESTERDAY&family_code=CODE`. Should return stale data immediately (no BC call) and trigger a background refresh.

4. **Deploy AL extension** if not already done — `C:\RGMC\AL\RGMC_ERAR_AL\source\RGMCItems\RGMCItemPriceAPIv3.Page.al` has the family pre-filter that makes BC-side queries faster. Backend caching already handles the common case, but the AL fix helps cold-start scenarios.

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that scans all `Price List Line` records into a temp buffer — this is inherently slow (60–120s on cold BC). Backend caching is the primary mitigation.
- `familyCode` is a temp-buffer field on `Pag50318` and **cannot be sent as an OData filter to BC** — BC rejects it with 400. The backend always fetches the full catalog and filters in Python.

### v3 Cache Key Shape
Full-catalog keys: `(company_name, None, None, None, on_date, None)`.
`_find_any_full_catalog_cache` scans for keys matching `key[1] is None and key[2] is None and key[3] is None and key[5] is None` (ignoring `on_date` at index 4).

### `OrderLine` no longer has `itemId`
Completely removed. Item presence is tracked via `itemNumber` (BC product number like "ITEM-001"). Any future code that adds `itemId` back to OrderLine will be a type error.

### `getActiveItemPrice` return type changed
Previously `Promise<number | null>`. Now `Promise<{ price: number | null; priceListCode: string | null }>`. Only caller is `lookupPrice` in `ScanningPage.vue`. Any future callers must handle the new shape.

### Phase 2 fallback condition
`useSync.ts` Phase 2 only hard-fails if `StorageService.getCachedItems().length === 0`. First-ever sync on a fresh device must succeed for items. Subsequent failures are silent (warning banner only).

### `useSync` is a module-level singleton
All refs (`isSyncing`, `syncProgress`, etc.) live outside the `useSync()` function body and are shared across all components that call `useSync()`.

### Price list code display
`.price-list-code` CSS in `ScanningPage.vue` is a small inline chip (medium-color bg, 0.68em font, `vertical-align: middle`). Only shown when `priceListCode` is non-empty. In the order line list, it appears inside the first `<p>` tag after `{{ formatCurrency(line.srp) }}`.

### AL source location
`C:\RGMC\AL\RGMC_ERAR_AL\source\RGMCItems\RGMCItemPriceAPIv3.Page.al` — Pag50318 definition. Note: the AL page has a field called `itemId` (the item's system GUID from the `Item` table) — this is different from the `OrderLine.itemId` field that was removed from the frontend.

### Backend warmup order (main.py)
Startup sequence: `warmup_company_id` → `rgmc_v3_warmup` → `warmup_bc_lists` → `warmup_rgmc_lists` → `warmup_rgmc_v2_lists` → `warmup_dimension_lists` → `rgmc_v2_warmup_company_settings`. The v3 warmup is second because it's the most critical for the frontend sync.

### `_V3_CACHE_TTL = 86400` (24 hours)
Prices change rarely. If updated mid-day, use `POST /bc/custom/v3/item-prices/refresh?company=...` to invalidate and re-warm.
