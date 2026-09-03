# Handoff

## Goal
Maintain and improve the RGMC Consignment Web App — an Ionic 7 + Vue 3 scanning app for logging sales/return orders against Business Central (BC). The backend is a FastAPI Python service at `C:\claude\rgmc-bc-api`. This session focused on: fixing substring BC searches (e.g. "41400" → "A093414000102"), caching BC search results locally, redesigning the scan page to show only added items with a direct "Add Item" button.

---

## Current State

**All code committed and clean. No uncommitted changes in either repo.**

### Webapp (`C:\claude\rgmc-consignment-webapp`)

**ScanningPage.vue** — redesigned. Item form card removed entirely. Page now shows:
1. Customer card (customer selector + posting date + No Sales toggle)
2. "Add Item" button (`add-item-bar`) that opens `ItemSelectorModal` directly
3. Order list (Sales/Returns tabs) — the main content

`addToSales` and `addToReturn` functions removed from script. `doConfirm()` via the confirm bottom sheet is the only add path now. `form` reactive object is still used internally for price tracking. ✅ committed `bf1c2f5`

**ItemSelectorModal.vue** — three improvements:
1. BC search results persisted to local cache after each successful search: `StorageService.mergeCachedItems()` (IndexedDB), `setCachedItemPrices()` (localStorage), `applyPriceMapToItems()` (in-memory). ✅ committed `d23bd28`
2. "Search Business Central" button always visible when query is typed + online, even when local results exist. Adaptive hint text: "Not finding it?" vs "Not in local cache?". ✅ committed `08b336f`
3. `dedupedBcResults` computed ref filters out items from BC results that already appear in local `filteredItems` — prevents duplicates when BC returns items already cached. ✅ committed `08b336f`

### BC API (`C:\claude\rgmc-bc-api`)

**`src/routers/bc_routes/rgmc_item_price_v3_routes.py`** — live BC `contains()` fallback added (commit `c001395`). Search order is now:
1. GCS catalog (Python contains filter — works for all items in blob)
2. Firestore prefix range query (fast O(matches), finds items whose productNo starts with query)
3. **Live BC OData call** — `contains(productNo,'X') or contains(description,'X')` — catches items missing from stale GCS/Firestore (e.g., A09341400* items added after last sync)
4. Return empty

Fallback 3 is fully exception-guarded; if BC's Pag50318 doesn't support `contains()`, it logs a warning and returns empty without crashing. `rgmc_v3_list_item_prices` was imported to enable this.

Previously committed fixes also awaiting deployment:
- `91478f4` — exact_only flag preventing full company scan
- `a15a6cc` — composite Firestore index + prefix range query
- `7099ccd` — case-insensitive search (`pno_upper = product_no.upper()`) and GCS contains filter

### Pending operational tasks
- **BC API not deployed** — commits `91478f4`, `a15a6cc`, `7099ccd`, `c001395` are in git but Cloud Run hasn't been rebuilt. Deploy needed.
- **Routine-sync not triggered** — USGI GCS catalog is stale (from 2026-08-10). Needs `POST /internal/firestore/routine-sync` to rebuild with current BC data. After this, GCS contains-filter will work for all items including A09341400*.
- **Backfill completion** — USGI and RGMC family-code backfills were triggered async in a prior session. Completion email → `it.arellanoerwin@gmail.com`. Not yet confirmed complete.

---

## Files Actively Being Edited

All committed. No mid-edit state.

- `src/views/ScanningPage.vue` — scan page redesign: item form card removed, `add-item-bar` added, `addToSales`/`addToReturn` removed. ✅ `bf1c2f5`
- `src/components/ItemSelectorModal.vue` — BC search caching, always-visible BC button, `dedupedBcResults`. ✅ `d23bd28`, `08b336f`
- `C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_v3_routes.py` — live BC contains fallback + `rgmc_v3_list_item_prices` import. ✅ `c001395`
- `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py` — `exact_only` param, `pno_upper` normalization, prefix range query. ✅ prior session commits
- `C:\claude\rgmc-bc-api\firestore.indexes.json` — composite `(company ASC, productNo ASC)` indexes for `item_prices_production` and `item_prices_staging`. ✅ live in Firestore

---

## Failed Attempts

- **What was tried**: `exact_only=True` on the GCS→Firestore fallback call — **Why it failed**: Prevented the prefix range query from running for USGI (which has a GCS catalog), so the fallback always returned empty. Fixed by removing `exact_only=True`.
- **What was tried**: Firestore prefix range `productNo >= "41400" AND productNo < "41401"` to find "A093414000102" — **Why it failed**: Prefix range only finds items whose productNo *starts with* the query; "41400" is in the middle of "A093414000102". Fixed by adding the live BC contains-search as a third fallback.
- **What was tried**: Firestore range query with lowercase input — **Why it failed**: BC productNos are uppercase; Firestore string comparison is case-sensitive so `productNo >= "a09341400"` found nothing. Fixed by `pno_upper = product_no.upper()`.
- **What was tried**: Creating Firestore composite indexes with unquoted `gcloud` `--field-config` flags — **Why it failed**: gcloud rejected the format. Needed `--field-config="field-path=company,order=ascending"`.
- **What was tried**: Auto-triggering routine-sync from within the session — **Why it failed**: Auto-mode classifier denied it as scope escalation. Must be run manually by the user.

---

## Next Step

**Deploy the BC API to production** so the contains-search fallback and prefix-range fixes go live:

```powershell
# From C:\claude\rgmc-bc-api
gcloud run deploy rgmc-bc-api-prod --source . --region asia-southeast1
```
(Confirm the service name with `gcloud run services list --region asia-southeast1` first.)

After deploying, verify the substring search works:
```
GET https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app/bc/custom/v3/item-prices?product_no=41400&family_code=AE&company=USGI
```
Expected: returns A093414000102. If empty, check Cloud Run logs for `Live BC contains search failed` — that means Pag50318 doesn't support `contains()` in OData and a different approach is needed.

Then rebuild the stale GCS catalog:
```
POST https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app/internal/firestore/routine-sync
X-Task-Secret: 68dbf91ade93cfe52c8a37b8309bbc17b7a8db4320d1c6d130ce0f54ffb9ac84
```

---

## Context & Gotchas

- **Two repos**: webapp `C:\claude\rgmc-consignment-webapp`, BC API `C:\claude\rgmc-bc-api`. They deploy independently. BC API also has a separate worker pool at `C:\claude\rgmc-worker-pool`.
- **BC API prod URL**: `https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app`
- **Webapp prod URL**: `https://rgmc-consignment-prod-935246372408.asia-southeast1.run.app`
- **GCS catalog is primary**: When `gcs_has_catalog=True`, the v3 list endpoint reads from GCS and the Python contains filter applies in-process (~200ms). Firestore is only a fallback. After routine-sync rebuilds GCS, the Firestore and live-BC fallbacks will rarely be needed.
- **`dedupedBcResults` is reactive**: As `filteredItems` updates (e.g. after BC results get saved to IDB and `refreshCache()` is called from `onItemModalClose`), the dedup happens automatically — items that move from BC results into local results disappear from the BC section.
- **`form` reactive object still used internally**: Even though the form card is gone from the template, `form.itemNumber`, `form.srp`, `form.priceListCode` are still set by `onItemSelected` and read by the date-change watcher and online-restore alert for price updates. Do not remove the `form` reactive object.
- **`barcodeOutline` icon**: imported in ScanningPage script but no longer used in the template after removing the item trigger row. Harmless, but can be cleaned up.
- **Confirm sheet is the only add path**: After removing the form card, items can only be added through: (1) tap "Add Item" → ItemSelectorModal → select item → confirm sheet → "Add to Sales / Return"; or (2) scan barcode in ItemSelectorModal scanner → confirm sheet.
- **Task secret**: `68dbf91ade93cfe52c8a37b8309bbc17b7a8db4320d1c6d130ce0f54ffb9ac84` (also in `credentials.txt`, gitignored).
- **Company casing**: Firestore doc IDs are always `{UPPERCASE_COMPANY}_{productNo}`. The BC API normalizes via `product_no.upper()` in the Firestore service. All callers must pass the correct company case or ensure the service layer normalizes it.
- **Stack**: Ionic 7 + Vue 3 + Pinia + TypeScript frontend. FastAPI Python backend (GCP Cloud Run). Business Central OData v4. Firestore + GCS for price catalog. Worker pool = separate Cloud Run service consuming Pub/Sub.
