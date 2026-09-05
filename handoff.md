# Handoff

## Goal
Three separate bug fixes across the RGMC consignment webapp and its backend services:

1. **Done** — Remove the item category filter chips from `ItemSelectorModal.vue` so the search always defaults to showing all categories.
2. **Done** — Fix the family code backfill for Firestore item prices in both the worker pool and BC API (items were missing `familyCode` in Firestore because routine syncs were overwriting backfilled values with empty strings).
3. **Done** — Fix cross-brand item contamination in the webapp where users logged in as Brand B could see Brand A's items after a user switch on the same device.

All three fixes have been implemented. The next task is **deploy all three services** and optionally run the `backfill-family-codes` worker command to patch existing Firestore documents.

---

## Current State

### Fix 1 — ItemSelectorModal.vue: Category filter removed ✅
- Category chips UI removed from `C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue`
- `selectedCat` ref, `effectiveCategories` computed, category filter block in `filteredItems`, related watchers and CSS removed
- `categories` and `initialCategoryCode` props kept for backward compatibility

### Fix 2 — Family code backfill: Fixed in both services ✅

**Worker pool** — `C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py`:
- `sync_prices_to_firestore`: now uses `batch.set(ref, doc_data, merge=True)` and only includes `familyCode` in the payload when BC returns a non-empty value (prevents incremental syncs from overwriting backfilled values with `""`)
- `backfill_family_codes`: skips records where BC returns no familyCode, uses parallel commits via `ThreadPoolExecutor`, returns `skipped_no_family_code` counter

**Worker pool** — `C:\claude\rgmc-worker-pool\src\workers\sync_worker.py`:
- Updated log message and `notify_success` in `backfill-family-codes` handler to include new `skipped_no_family_code` stat

**BC API** — `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py`:
- Same `merge=True` fix in `sync_prices_to_firestore`
- Same skip-when-empty fix in `backfill_family_codes`

### Fix 3 — Cross-brand item contamination: Fixed ✅
**Root cause**: `onIonViewWillEnter` in `ScanningPage.vue` never called `refreshCache()`. Because Ionic caches tab views, `onMounted` only fires once. When user B logs in after user A, `authStore.brand` updates but `cachedItems` still held user A's brand items. The modal received `props.items = cachedItems` (old brand), and since `props.items.length > 0`, it bypassed the first-use API fetch and showed the old brand's items.

**Fix**: Added `refreshCache()` at the top of `onIonViewWillEnter` in `C:\claude\rgmc-consignment-webapp\src\views\ScanningPage.vue` (around line 796).

---

## Files Actively Being Edited

- `C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue` — Category filter removed; file is complete and clean
- `C:\claude\rgmc-consignment-webapp\src\views\ScanningPage.vue` — Added `refreshCache()` call to `onIonViewWillEnter`; file is complete and clean
- `C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py` — `sync_prices_to_firestore` uses `merge=True`, `backfill_family_codes` skips empty; complete
- `C:\claude\rgmc-worker-pool\src\workers\sync_worker.py` — Updated success notification for backfill-family-codes; complete
- `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py` — Same `merge=True` and skip-empty fixes as worker pool; complete

---

## Failed Attempts

- **What was tried**: Looked for cross-brand contamination via `mergeCachedItems` overwriting same-id items from other brands — **Why it failed**: The `familyCode` tagging in merge is correct; items from other brands with different familyCodes aren't affected unless the same item ID exists in both brands (edge case, not the reported issue)
- **What was tried**: Investigated whether `??` (nullish coalescing) mishandling of empty-string `familyCode` could cause wrong tagging — **Why it failed**: Empty string `""` is preserved by `??`, so items with `familyCode: ""` are EXCLUDED from brand filters rather than incorrectly included in another brand
- **What was tried**: Checked API filtering for `family_code` in the route handler — the API correctly filters GCS/Firestore records by `familyCode` — **Why it failed**: Not the source of contamination; API-returned items are brand-correct
- **What was tried**: Investigated whether `IDB restore path` loading all brands causes contamination — `loadCachedItemsAsync()` loads all brands, but `refreshCache()` filters them — **Why it failed**: Not root cause; filtering works correctly IF `refreshCache()` is called with the right brand at the right time

---

## Next Step

**Deploy all three services and run the backfill:**

1. Deploy `rgmc-consignment-webapp` (Fix 1 + Fix 3 are frontend-only)
2. Deploy `rgmc-worker-pool` (Fix 2: backfill and sync fixes)
3. Deploy `rgmc-bc-api` (Fix 2: sync fix)
4. After deploying the worker pool, trigger `backfill-family-codes` for each company to patch existing Firestore docs that have empty/missing `familyCode`. This is needed because existing production data in Firestore may have items with `familyCode: ""` that the routine sync previously wrote.
5. Consider advising users affected by cross-brand contamination to log out and log back in — this triggers `onIonViewWillEnter` which now calls `refreshCache()`, clearing stale brand-A items from `cachedItems`.

---

## Context & Gotchas

- **`familyCode` is a computed temp-buffer field in BC's Pag50318** — BC returns it in responses but it CANNOT be used as an OData `$filter` parameter (BC rejects it). The worker pool routes around this by resolving item numbers from a separate `items` table query and filtering by `productNo`.
- **`merge=True` in Firestore batch.set** — Only the specified fields are written; existing fields not in the payload are preserved. This is critical for the backfill to survive incremental syncs.
- **Incremental BC sync via `lastModifiedDateTime gt {since}`** — BC may not populate temp-buffer fields (like `familyCode`) in filtered/incremental responses. That's why the fix pops `familyCode` from the sync payload when empty rather than writing `""`.
- **`??` vs `||` for brand tagging** — `setCachedItems` uses `i.familyCode ?? (brand || undefined)`. This preserves a set `familyCode` (even an empty string `""`). An item with `familyCode: ""` will NOT be tagged with the brand and will NOT match any brand filter — it becomes invisible. This is by design to avoid masking the underlying data problem.
- **Ionic keep-alive tabs** — `onMounted` fires only once in an Ionic tab view; `onIonViewWillEnter` fires every time the tab becomes active. Any initialization that needs to re-run on brand/user switch MUST be in `onIonViewWillEnter`, not `onMounted`.
- **`brand.itemFamilyCode` vs `brand.code`** — The `Brand` type has an optional `itemFamilyCode` field. `auth.store.ts` uses `brand.itemFamilyCode ?? brand.code` for contact brand tag authorization. However, all item filtering throughout the webapp uses `brand.code` directly (not `itemFamilyCode`). If `brand.code` and the item's `familyCode` ever diverge in value, items would go missing — worth watching if new brands are added.
- **GCS catalog is per-company, not per-brand** — The GCS blob (`{env}/{COMPANY}/catalog.json`) contains ALL brands' items. The API filters by `familyCode` in Python after loading the blob. A stale/missing `familyCode` on a GCS record makes that item invisible to brand queries but does NOT cause cross-brand leakage.
- **IDB key `'all'` is shared across brands** — All brands' items live under the single `'all'` key in IndexedDB. Brand isolation is enforced via the `familyCode` field on each item and the filter in `refreshCache()`. If IDB is cleared, all brands' items are gone.
- **Three repos involved**: `rgmc-consignment-webapp` (Vue/Ionic frontend), `rgmc-bc-api` (FastAPI Python backend), `rgmc-worker-pool` (Pub/Sub worker). All live under `C:\claude\`.
