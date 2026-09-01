# Handoff

## Goal
Maintain and improve the RGMC Consignment Web App — an Ionic 7 + Vue 3 + Pinia + TypeScript scanning app that allows sales reps to log sales/return orders against Business Central (BC). The backend is a FastAPI Python service at `C:\claude\rgmc-bc-api` that proxies BC OData v4 and Firestore for item prices. Worker pool at `C:\claude\rgmc-worker-pool` handles Pub/Sub-driven sync jobs.

This session resolved a root-cause issue where items (e.g., `A093414000102` and all `A09341400*` prefix items) under brand `AE` / company `USGI` were missing from the item list and BC search. Multiple related fixes were applied across all three repos.

## Current State

**All code committed and clean across all three repos. No uncommitted changes.**

### Fix 1 — Worker pool: `familyCode` now written on routine sync (COMPLETE, deployed)
`C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py`

`sync_prices_to_firestore` was missing an explicit `"familyCode": record.get("familyCode") or ""` in the `batch.set()` call. The main API had it; the worker pool did not. Now both are consistent. Future routine syncs will persist `familyCode` on all Firestore item price documents.

### Fix 2 — Firestore backfill for existing documents (COMPLETE, deployed)
`C:\claude\rgmc-bc-api\src\services\price_firestore_service.py`
`C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_firestore_routes.py`
`C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py`
`C:\claude\rgmc-worker-pool\src\workers\sync_worker.py`

Added `backfill_family_codes(records, company)` in both service files. Uses `batch.set(..., merge=True)` with `company.upper()` for document IDs (critical — see Gotchas). Two new endpoints on `rgmc-bc-api`:
- `POST /internal/firestore/backfill-family-codes?company=USGI` — synchronous, blocks until done
- `POST /internal/firestore/backfill-family-codes-async?company=USGI` — publishes to Pub/Sub, worker pool runs it and sends email on completion

Worker pool now handles message type `"backfill-family-codes"` with start/progress/complete logs.

**The backfill has NOT been successfully run yet on USGI or RGMC.** Earlier attempts failed due to bugs (404 from `batch.update`, wrong doc IDs from lowercase company name). Both bugs are now fixed. The backfill needs to be triggered after deploying the current code.

### Fix 3 — BC search and GCS/Firestore item lookup now work for partial and missing-familyCode items (COMPLETE, deployed)
`C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_v3_routes.py`
`C:\claude\rgmc-bc-api\src\services\price_firestore_service.py`

Three sub-fixes:
1. `family_code` filter is skipped when `product_no` is given (direct item lookup should never be blocked by a missing/stale `familyCode`)
2. `product_no` filter changed from exact match (`!=`) to `startswith` — enables partial/like search from the search bar (e.g., typing "A0934" finds "A093414000102")
3. When GCS has the catalog but a specific `product_no` is not in the GCS blob, falls back to a Firestore direct document lookup before returning empty

Also: `get_prices_from_firestore` fast path 1 now falls through on exact-doc miss (instead of returning `[]`) so the scan paths below can do `startswith` matching for partial queries.

### Fix 4 — BC search results preserved after adding an item (COMPLETE, committed)
`C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue`

Root cause: `onItemSelected` sets `form.categoryCode = item.itemCategoryCode`, which flows into the modal's `:initial-category-code` prop → triggers `selectedCat` update → triggers `watch([searchQuery, selectedCat], clearBcResults)`. 

Fixed by moving the `initialCategoryCode` watcher to after `bcSearchResults` is declared and adding a guard: `if (v && !bcSearchResults.value.length) selectedCat.value = v`. BC results are now preserved while visible; the category sync resumes after results are cleared.

### Fix 5 — BC search option on scanner camera page (COMPLETE, committed)
`C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue`

When a barcode is scanned and not found in local cache (while online), the scanner now stays on the camera page instead of switching to list view. A dark bottom panel appears showing:
- Warning icon + "Item not in local cache"
- The scanned barcode in monospace
- "Search Business Central" button (auto-triggers `searchInBC()` then switches to list view with results)
- "Scan Again" button (restarts camera via `openScanner()` since stream is null after resolve)

Offline path unchanged: still switches to list view with barcode in search query.

## Files Actively Being Edited

All changes are committed. No files are mid-edit.

- `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py`
  — `backfill_family_codes()` added (uses `company.upper()` + `set(merge=True)`)
  — `get_prices_from_firestore` fast path 1 falls through on miss
  — Scan paths filter by `startswith(product_no)` when product_no is set

- `C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_firestore_routes.py`
  — `backfill_family_codes` imported
  — `POST /internal/firestore/backfill-family-codes` endpoint added
  — `POST /internal/firestore/backfill-family-codes-async` endpoint added

- `C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_v3_routes.py`
  — `family_code` filter skipped when `product_no` is given
  — `product_no` filter changed to `startswith`
  — GCS → Firestore fallback added for single-item miss

- `C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py`
  — `sync_prices_to_firestore`: explicit `familyCode` field added to `batch.set()`
  — `backfill_family_codes()` added (uses `company.upper()`)

- `C:\claude\rgmc-worker-pool\src\workers\sync_worker.py`
  — `backfill_family_codes` imported
  — `"backfill-family-codes"` message type handler added (with start/complete logs)
  — Company uppercased at handler start
  — Module docstring updated

- `C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue`
  — `initialCategoryCode` watcher moved + guarded by `!bcSearchResults.value.length`
  — `ScanStatus` type: added `'not-found'`
  — `scanHintText`: added `'not-found'` case
  — `resolveBarcode`: online miss → `scanStatus = 'not-found'` (stays in scanner view)
  — `searchScannedInBC()` function added
  — `resumeScanning()`: restarts camera (`openScanner()`) when `videoStream.value === null`
  — Not-found panel added to scanner template
  — CSS: `.not-found-wrap`, `.not-found-header`, `.not-found-icon`, `.not-found-title`, `.not-found-code`, `.not-found-bc-btn`, `.scan-hint--not-found` added

## Failed Attempts

- **What was tried**: `batch.update(ref, {"familyCode": ...})` in backfill — **Why it failed**: Firestore `update()` returns 404 when the document doesn't exist. Changed to `batch.set(..., merge=True)`.

- **What was tried**: `backfill_family_codes` only added to `rgmc-bc-api`'s `price_firestore_service.py` — **Why it failed**: Worker pool has its own separate copy of `price_firestore_service.py`; `sync_worker.py` imports from that copy. `ImportError: cannot import name 'backfill_family_codes'` on worker pool startup. Fixed by adding the function to the worker pool's copy as well.

- **What was tried**: Backfill endpoint called with `?company=rgmc` (lowercase) — **Why it failed**: Firestore doc IDs are `{company}_{productNo}` and the sync writes them using `config.BC_COMPANY` which is uppercase (`RGMC`, `USGI`). Lowercase company produced wrong doc IDs (e.g., `rgmc_M013080500203`). With `merge=True`, new stub documents were silently created at the wrong IDs instead of patching the real docs. Fixed by `company.upper()` in `backfill_family_codes`.

- **What was tried**: Checking for family code mismatch in the Item Family in BC — **Why it failed**: Not the issue. BC correctly returns `familyCode = "AE"` for AE-family items (confirmed by reading `RGMCItemPriceAPIv3.Page.al` line 326: `Rec."Family Code" := TempItem."LSC Item Family Code"`). The problem was purely in the Firestore write pipeline (worker pool never persisted `familyCode`) and lookup filters (GCS filter blocked items with empty familyCode even on direct product_no lookup).

- **What was tried**: Several dead ends for the customer dropdown bug (prior session) — ghost click, CSS pointer-events, debounce race — these were already in the previous handoff; all fixed via `onIonViewWillEnter`.

## Next Step

**Run the family code backfill for all companies.** Deploy `rgmc-bc-api` (if not already deployed with today's commits), then call:

```
POST /internal/firestore/backfill-family-codes?company=USGI
  Header: X-Task-Secret: <TASK_SECRET>

POST /internal/firestore/backfill-family-codes?company=RGMC
  Header: X-Task-Secret: <TASK_SECRET>
```

(Repeat for any other companies.) Then verify item `A093414000102` appears in the USGI item list after a fresh sync from the app, and that `familyCode` field is now visible in Firestore console under `item_prices_production/USGI_A093414000102`.

Alternatively use the async endpoint and wait for the success email:
```
POST /internal/firestore/backfill-family-codes-async?company=USGI
POST /internal/firestore/backfill-family-codes-async?company=RGMC
```

After successful backfill, trigger a GCS catalog rebuild (`POST /internal/firestore/routine-sync`) so the GCS blob also carries the updated `familyCode` values and future requests skip the Firestore fallback.

## Context & Gotchas

- **Two backend repos**: `C:\claude\rgmc-bc-api` (main FastAPI API, Cloud Run) and `C:\claude\rgmc-worker-pool` (Pub/Sub consumer). They have **separate copies** of `price_firestore_service.py` that must be kept in sync manually. Any function added to one must be added to the other if the worker pool needs it.

- **Company name casing**: Firestore document IDs are `{COMPANY}_{productNo}` where COMPANY is always uppercase because `config.BC_COMPANY` is set to `"RGMC"` / `"USGI"`. The GCS `_blob_path` already does `.upper()`. `backfill_family_codes` now does `company.upper()` explicitly. All other service functions (`sync_prices_to_firestore`, `get_prices_from_firestore`) rely on the caller passing the correct case — they do NOT normalize.

- **GCS catalog is the primary source**: When `gcs_has_catalog=True`, the `/bc/custom/v3/item-prices` endpoint reads from GCS and skips Firestore for list queries. The Firestore fallback only applies for single-item lookups (`product_no` given) when the item is not in the GCS blob. After a successful backfill + routine-sync, the GCS blob will have correct `familyCode` values and the Firestore fallback path will be less critical.

- **`product_no` filter is now `startswith` on GCS path**: This means passing a full item number (e.g., `A093414000102`) still works (exact match is a subset of startswith). But passing a single-letter prefix could return a very large set. The BC search from the app always passes at least the full barcode/search query, so this is fine in practice.

- **`searchInBC` / `searchScannedInBC` flow**: `searchScannedInBC` sets `barcodeNotFound.value = true`. The existing watcher `watch(barcodeNotFound, (found) => { if (found && props.isOnline && searchQuery.value.trim()) searchInBC(); })` auto-fires. Do NOT call `searchInBC()` directly from `searchScannedInBC` — it would be a double call.

- **`resumeScanning` now checks `videoStream.value`**: In the scanner not-found state, the camera stream was already stopped by `stopCamera()` inside `acceptBarcode()` before `resolveBarcode` ran. `resumeScanning` now detects `videoStream.value === null` and calls `openScanner()` for a full restart. In confirm/multiple states, the stream is still active and only detection was paused — `startAutoDetection()` is called directly as before.

- **BC AL page 50318 (`familyCode` origin)**: `familyCode` is populated in `InsertPriceLine` from `TempItem."LSC Item Family Code"` where `TempItem` is the Item table record. `SetLoadFields` includes `"LSC Item Family Code"`. So BC returns the correct value — the pipeline failure was entirely on the Python/Firestore side.

- **TypeScript**: `npx vue-tsc --noEmit` from `C:\claude\rgmc-consignment-webapp`. No output = clean. Verified clean at end of session.

- **Stack**: Ionic 7 + Vue 3 + Pinia + TypeScript frontend. FastAPI Python backend (GCP Cloud Run). Business Central OData v4. Firestore + GCS for price catalog. Capacitor for mobile packaging. Worker pool = separate Cloud Run service consuming Pub/Sub.
