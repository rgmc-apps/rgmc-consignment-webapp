# Handoff

## Goal
Deploy three bug fixes across RGMC consignment webapp and its backend services, then run the `backfill-family-codes` worker command to patch existing Firestore documents:

1. **Fix 1** — Remove item category filter chips from `ItemSelectorModal.vue` (search always shows all categories)
2. **Fix 2** — Preserve `familyCode` in Firestore during incremental BC syncs (worker pool + BC API both use `merge=True` and skip empty values)
3. **Fix 3** — Fix cross-brand item contamination: user B seeing user A's items after a device switch

All code changes are committed and pushed. The remaining work is deployment and backfill.

---

## Current State

### All three fixes: Code complete, committed, pushed ✅

**rgmc-consignment-webapp** — `origin/master` is at `fdc23ee`
- `fdc23ee` fix build: add missing ItemCategory import in ItemSelectorModal
- `5fb0a4e` added fix for retain customer
- `a99c487` added scanning page modifications ← contains Fix 3 (`refreshCache()` in `onIonViewWillEnter`)
- `fe5837a` removed the item selector categories ← contains Fix 1

**rgmc-bc-api** — `origin/master` is at `2369db5`
- `b31369d` added family code backfill fix ← contains Fix 2 (`merge=True`, skip-empty)

**rgmc-worker-pool** — `origin/master` is at `fe2e6c0`
- `fe2e6c0` added family code backfill fix for all ← contains Fix 2
- `fd04bc1` added family code backfill fix ← earlier iteration of Fix 2

### Deployment status: UNKNOWN / IN PROGRESS
- Webapp had a Cloud Build failure this session (missing `ItemCategory` import) — fixed in `fdc23ee`, needs re-trigger
- bc-api: no deploy script found; likely needs manual `gcloud run deploy` or a GCP Cloud Build trigger
- worker-pool: has `deploy.sh` — not yet run this session
- Backfill (`backfill-family-codes`): not yet run

### Incidental runtime error: NOT an app bug
A `VM57:2 Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')` error appears in the item selector. This is from an external web-vitals-style performance monitoring script (browser extension or injected analytics tag). It is NOT from app code. Confirmed: `ItemSelectorModal.vue` has no `startTime` references; `filteredItems` computed is clean. Reproduces outside of incognito = extension; does not reproduce in incognito = not our code.

---

## Files Actively Being Edited

- `C:\claude\rgmc-consignment-webapp\src\components\ItemSelectorModal.vue` — Added `ItemCategory` to the type import at line 330 (was causing Cloud Build TS2304 error). Also had category filter chips removed in a prior session. File is complete and clean.
- `C:\claude\rgmc-consignment-webapp\src\views\ScanningPage.vue` — Added `refreshCache()` at top of `onIonViewWillEnter` (line 798) to fix cross-brand contamination. Complete and clean.
- `C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py` — `sync_prices_to_firestore` uses `batch.set(ref, doc_data, merge=True)`; `backfill_family_codes` skips records where BC returns no familyCode, uses parallel commits. Complete.
- `C:\claude\rgmc-worker-pool\src\workers\sync_worker.py` — Updated `notify_success` log in `backfill-family-codes` handler to include `skipped_no_family_code` stat. Complete.
- `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py` — Same `merge=True` and skip-empty fixes as worker pool. Complete.

---

## Failed Attempts

- **What was tried**: Cloud Build deploy of webapp before this session's fix — **Why it failed**: `src/components/ItemSelectorModal.vue` used `ItemCategory` in the `categories` prop definition but only imported `Item` from `@/types`. TS2304 error at line 344. Fixed in commit `fdc23ee`.
- **What was tried**: Investigated `startTime` runtime error as an app code bug — **Why it failed**: `VM57:2` indicates an eval'd/injected external script (web-vitals pattern). App has no `web-vitals`, Firebase Performance, or `startTime` references in its source. Not fixable from app code.
- **What was tried** (prior session): Cross-brand contamination via `mergeCachedItems` overwriting items — **Why it failed**: Not root cause; items from other brands with different familyCodes aren't affected unless the same item ID exists in both brands.
- **What was tried** (prior session): Nullish coalescing `??` mishandling of empty-string `familyCode` — **Why it failed**: Empty string `""` is preserved by `??`, so items with `familyCode: ""` are EXCLUDED from brand filters rather than incorrectly included in another brand.

---

## Next Step

**Re-trigger the webapp Cloud Build deploy** (the `fdc23ee` fix is pushed; Cloud Build should now succeed). Then:

1. **Deploy rgmc-bc-api** — no deploy script found; likely needs `gcloud run deploy` or a manual Cloud Build trigger from GCP console for repo `rgmc-apps/rgmc-bc-api`.
2. **Deploy rgmc-worker-pool** — run `deploy.sh` from `C:\claude\rgmc-worker-pool`:
   ```
   cd C:\claude\rgmc-worker-pool
   bash deploy.sh
   ```
   Confirm with `y` at the prompt. Uses `cloudbuild.yaml` → deploys to Cloud Run Worker Pool on GCP project `durable-woods-465907-n1`, region `asia-southeast1`.
3. **Run backfill** — after worker pool is live, trigger `backfill-family-codes` for each company to patch Firestore docs that have `familyCode: ""`. Exact trigger mechanism depends on the Pub/Sub message format used by the worker pool.
4. **Advise affected users** — users who experienced cross-brand contamination should log out and log back in. This causes `onIonViewWillEnter` to fire, which now calls `refreshCache()` and clears stale brand-A items.

---

## Context & Gotchas

- **How the webapp is deployed**: GitHub repo `rgmc-apps/rgmc-consignment-webapp`. Has `docker-entrypoint.sh` (container-based). No Firebase config found. Cloud Build triggers on push to master. The previous deploy attempt failed at `npm run build` step due to the missing `ItemCategory` import — that is now fixed.
- **How the worker pool is deployed**: `C:\claude\rgmc-worker-pool\deploy.sh` + `cloudbuild.yaml`. GCP project `durable-woods-465907-n1`, region `asia-southeast1`. Cloud Run Worker Pool named `rgmc-worker-pool`. Service account `rgmc-worker-pool@durable-woods-465907-n1.iam.gserviceaccount.com`.
- **How bc-api is deployed**: Has `Dockerfile` and `compose.yaml` (local dev). No `deploy.sh` or `cloudbuild.yaml` found. Likely deployed via manual `gcloud run deploy` or a GCP Cloud Build trigger — user knows the process.
- **`familyCode` is a temp-buffer field in BC Pag50318** — BC returns it in responses but it CANNOT be used as an OData `$filter` parameter. The worker pool routes around this by resolving item numbers from a separate `items` table query and filtering by `productNo`.
- **`merge=True` in Firestore batch.set** — Only the specified fields are written; existing fields not in the payload are preserved. This is critical for the backfill to survive incremental syncs.
- **Incremental BC sync via `lastModifiedDateTime gt {since}`** — BC may not populate temp-buffer fields (like `familyCode`) in filtered/incremental responses. The fix pops `familyCode` from the sync payload when empty rather than writing `""`.
- **`??` vs `||` for brand tagging** — `setCachedItems` uses `i.familyCode ?? (brand || undefined)`. An item with `familyCode: ""` will NOT be tagged with the brand and will NOT match any brand filter — it becomes invisible. By design to avoid masking the underlying data problem.
- **Ionic keep-alive tabs** — `onMounted` fires only once in an Ionic tab view; `onIonViewWillEnter` fires every time the tab becomes active. Any initialization that needs to re-run on brand/user switch MUST be in `onIonViewWillEnter`, not `onMounted`.
- **`brand.itemFamilyCode` vs `brand.code`** — The `Brand` type has an optional `itemFamilyCode` field. `auth.store.ts` uses `brand.itemFamilyCode ?? brand.code` for contact brand tag authorization. However, all item filtering throughout the webapp uses `brand.code` directly. If `brand.code` and the item's `familyCode` diverge, items would go missing — watch if new brands are added.
- **GCS catalog is per-company, not per-brand** — The GCS blob (`{env}/{COMPANY}/catalog.json`) contains ALL brands' items. API filters by `familyCode` in Python after loading the blob. A stale/missing `familyCode` makes items invisible to brand queries but does NOT cause cross-brand leakage.
- **IDB key `'all'` is shared across brands** — All brands' items live under the single `'all'` key in IndexedDB. Brand isolation is enforced via `familyCode` field on each item and the filter in `refreshCache()`.
- **Three repos**: `rgmc-consignment-webapp` (Vue/Ionic frontend), `rgmc-bc-api` (FastAPI Python backend), `rgmc-worker-pool` (Pub/Sub worker). All under `C:\claude\`.
