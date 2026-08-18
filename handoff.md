# Handoff

## Goal

Maintain and harden the RGMC Consignment Web App — an Ionic/Vue 3 offline-first PWA for sales reps to scan items and submit sales/return orders against Business Central. Ongoing bug fixes and feature additions per user requests.

All changes are committed and the working tree is clean through `015ccd0`.

---

## Current State

**Working tree:** Clean. All session changes committed. `vue-tsc --noEmit` passes with zero errors.

### What is complete and working

#### From previous sessions (still active)

- **Brand-isolated customer and item cache** — `getCachedCustomers`, `setCachedCustomers`, `mergeCachedCustomers` all support `brand` param. `setCachedItems(items, brand)` keeps other brands' items intact. `applyPriceMapToItems(prices, brand)` only touches items with matching `familyCode`.
- **`useSync.ts` guard** — aborts sync if `company` or `brand` is empty string.
- **Cache-first login** — `handleLogin()` checks `StorageService.getLastSync(company, brand)`; if truthy (`hadPriorSync`), routes straight to `/app/home` without sync.
- **Drafts filtered by company+brand** — `visibleDrafts` in `LandingPage` filters by `brand.code` AND `companyCode`.
- **Login settings panel + ProfileMenu** — version (`__APP_VERSION__`), build timestamp (`__APP_BUILD__`), Update Application button.
- **PWA auto-update** — Update Application sends `SKIP_WAITING` to service worker, waits 400ms, reloads.
- **`ItemSelectorModal` `watch(lookupDate)`** — date mismatch wipes `livePrices` to force re-fetch.

#### New in this session

1. **Category filter resets after adding item** (`ScanningPage.vue`)
   - `resetItemForm()` now clears `form.categoryCode = ''`. Previously it retained the last category.
   - `OrderLine` interface in `src/types/index.ts` has `categoryCode?: string`.
   - `doConfirm()`, `addToSales()`, `addToReturn()` all pass `categoryCode: item.itemCategoryCode || undefined` (or `form.categoryCode || undefined`) to the created order line.
   - Order list template shows category with a blue dot: `{{ line.itemNumber }} • {{ categories.find(c => c.code === line.categoryCode)?.displayName ?? line.categoryCode }}`.
   - CSS class `.line-category { color: var(--ion-color-primary) }` styles the category text.
   - **Bug fixed in the same change**: toast was using `form.itemName` AFTER `resetItemForm()` cleared it. Fixed by capturing `const itemName = form.itemName` before calling `resetItemForm()`.

2. **BC direct item search** (`ItemSelectorModal.vue` + `api.service.ts`)
   - When a local search returns no results, a "Search Business Central" button appears.
   - When the barcode scanner fails to resolve a code locally (`barcodeNotFound` watcher), BC search is auto-triggered.
   - `ApiService.searchItemsByNumber(query, onDate, familyCode?)` calls `/bc/custom/v3/item-prices?product_no=<query>`.
   - Race condition protection: module-level `let _bcSearchId = 0` increments on each search start; stale responses are discarded if `id !== _bcSearchId` at resolution.
   - UI: spinner while searching, results in a separate "Business Central results" section with `×` dismiss button, error text on failure, "No results in BC" message when empty.
   - Two `watch([searchQuery, selectedCat])` watchers coexist — the original resets pagination, the new one clears BC results. Both fire in registration order. No conflict.

3. **Spurious sync fix for cached brands** (`storage.service.ts` + `ScanningPage.vue`)
   - **Root cause**: `refreshCache()` filters `_itemsMemory` by `i.familyCode === brandCode`. Items synced before this fix were stored with `familyCode: undefined` (API doesn't always return that field), so the filter returned 0 items → `cachedItems.value.length === 0` → `onMounted` triggered a full sync even though data was already cached.
   - **Fix A — `storage.service.ts` line 218**: `familyCode: i.familyCode ?? (brand || undefined)`. When syncing for a specific brand, items that lack `familyCode` in the API response are tagged with the synced brand code. Future syncs will always produce properly tagged items.
   - **Fix B — `ScanningPage.vue` lines 838–843**: `onMounted` now reads `StorageService.getLastSync(company, brand)` and sets `hadPriorSync`. The auto-sync only fires when `cachedItems.value.length === 0 && isOnline.value && !hadPriorSync`. Mirrors the same logic `handleLogin()` already used.
   - **Migration behavior**: Existing devices with untagged items will skip the spurious sync (Fix B), but the scan page may show 0 items until the user does a manual pull-to-refresh. That manual sync applies Fix A, tagging all items, and the issue is permanently resolved for that device.

4. **GitHub Actions workflow** (`.github/workflows/dev-item-comment.yml`)
   - Fires on every push; finds `DI-XXXX` codes in commit messages; POSTs to RGMC gateway webhook.
   - Previously used `core.setFailed()` when secrets were missing → CI showed red on every push. Changed to `core.warning()` so CI stays green until secrets are configured.
   - Secrets to add when ready: `RGMC_GATEWAY_URL`, `RGMC_WEBHOOK_SECRET` (GitHub → Settings → Secrets and variables → Actions).

---

## Files Actively Being Edited

All committed. No files in mid-edit state.

- `src/types/index.ts` — `OrderLine` has `categoryCode?: string`
- `src/views/ScanningPage.vue` — category reset in `resetItemForm`; `categoryCode` passed to order lines; order list template updated; `onMounted` `hadPriorSync` guard
- `src/services/storage.service.ts` — `setCachedItems` line 218: `familyCode: i.familyCode ?? (brand || undefined)`
- `src/services/api.service.ts` — `searchItemsByNumber()` method added
- `src/components/ItemSelectorModal.vue` — BC search UI, `_bcSearchId` counter, `barcodeNotFound` watcher, BC results section
- `.github/workflows/dev-item-comment.yml` — `core.setFailed` → `core.warning` for missing secrets

---

## Failed Attempts

- **Toast showing empty item name**: Original `addToSales()`/`addToReturn()` called `resetItemForm()` then read `form.itemName` for the toast — name was already cleared. Fixed by capturing `const itemName = form.itemName` before `resetItemForm()`.
- **Backwards-compat customer filter `!c.brandCode || c.brandCode === brand`** (previous session): Caused all pre-existing untagged customers to bleed into every brand view. Removed; strict equality used instead.
- **Keying `mergeCachedCustomers` map by `c.id` alone** (previous session): Same customer ID in two brands caused one brand to overwrite the other. Fixed with composite key `"brandCode::id"`.
- **`setCachedItems` writing `slim` to IDB** (previous session): IDB write only captured the new batch, losing other brands' items from IDB on every sync. Fixed by writing `snapshot = _itemsMemory` after merge.

---

## Next Step

**Test the spurious-sync fix on a real device:**

1. Log in with a brand that shows the "cached" badge on the login page.
2. Verify the scan page loads WITHOUT triggering a sync (sync bar shows previous sync time, not "Syncing…").
3. If scan page shows "Data not loaded" (items = 0 after skipping sync), this is the migration case — old items lack `familyCode`. Pull-to-refresh once to re-sync and permanently fix that device's cache.
4. Log out and log in again — confirm no auto-sync fires.
5. Confirm BC search works: search for a term with no local results → "Search Business Central" button appears → tap it → results appear from BC.

---

## Context & Gotchas

### Architecture

- **Brand code = `familyCode` on items** — `Item.familyCode` equals `Brand.code`. `refreshCache()` filters `allItems.filter(i => i.familyCode === brandCode)`. If `authStore.brand?.code` is null (e.g., after a hard F5 refresh), `brandCode` is undefined and ALL items are returned (no filter). This is correct offline-refresh behavior.
- **Items: single flat array in IndexedDB** — `rgmc-cache` db, `items` store, key `'all'`. All brands coexist by `familyCode` partitioning.
- **Customers: single localStorage key** — `rgmc_cache_customers` as `{ company: string, data: SlimCustomer[] }`. Multi-brand customers coexist in `data`, differentiated by `brandCode`.
- **Sync timestamps keyed by `"companyCode::brandCode"`** in `rgmc_sync_timestamps`. Old flat-key format (`customers`/`items` at top level) is detected and wiped on read — if this wipe fires, `hadPriorSync` becomes `false` and auto-sync will run once.
- **`StorageService.init()` is idempotent** — singleton promise, safe to call multiple times. `App.vue` calls it fire-and-forget on `onMounted`; `ScanningPage.vue` awaits it. Since Vue 3 fires child `onMounted` before parent's, `ScanningPage` creates the promise first.

### Known dead code (harmless)

- `src/stores/app-mode.store.ts` — never imported anywhere.
- `syncIfStale()` in `useSync.ts` — still exists, zero callers.

### TypeScript

- `vue-tsc --noEmit` passes. Plain `tsc --noEmit` shows false-positive `.vue` errors — ignore, known limitation without `moduleResolution: bundler`.

### GitHub Actions

- The `dev-item-comment.yml` workflow skips commits with no `DI-XXXX` pattern (no noise).
- Gateway endpoint: `POST {RGMC_GATEWAY_URL}/api/webhooks/github-push` with `X-Webhook-Secret` header.
- Without secrets configured: job emits a yellow warning and exits green. No action needed until gateway is ready.
