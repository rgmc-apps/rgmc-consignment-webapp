# Handoff

## Goal
Maintain and improve the RGMC Consignment Web App — an Ionic 7 + Vue 3 scanning app for logging sales/return orders against Business Central (BC). The backend is a FastAPI Python service at `C:\claude\rgmc-bc-api`. Worker pool at `C:\claude\rgmc-worker-pool`. This session focused on: verifying previous session's deployments, then implementing GCS caching for customers, contacts, and item categories so the BC API serves those datasets from GCS (~200ms) instead of hitting BC OData directly (2-5s per call, worse on cold start).

---

## Current State

**All code committed in both repos. Neither has been deployed to production yet.**

### Webapp (`C:\claude\rgmc-consignment-webapp`)
No changes this session. Clean at prior state.

### BC API (`C:\claude\rgmc-bc-api`)

**Latest commit**: `67de54e` — "serve customers, contacts, item categories from GCS cache"

**What changed:**

1. **`src/services/gcs_catalog.py`** — Added 3 data type sections (customers, contacts, item categories), each following the exact same pattern as existing `load_pl_headers_cached` / `load_pl_items_cached`:
   - In-process memory caches: `_customers_mem`, `_contacts_mem`, `_item_categories_mem` (5-min TTL, thread-safe locks)
   - `_customers_blob_path`, `_contacts_blob_path`, `_item_categories_blob_path` → `{GCP_ENV}/{COMPANY}/{type}.json`
   - `load_customers_cached(company)`, `load_contacts_cached(company)`, `load_item_categories_cached(company)` → memory → GCS → None (caller falls through to BC if None)
   - `evict_customers`, `evict_contacts`, `evict_item_categories` for future cache invalidation

2. **`src/routers/bc_routes/rgmc_customer_v2_routes.py`** — `list_customers()` now tries GCS first:
   - Added `modified_since` query param
   - If no raw OData `filter` param: loads from GCS, applies `brand` and `modified_since` in Python, returns immediately
   - Falls through to BC when GCS blob is absent (first run before worker pool has synced) or when a raw OData filter is requested

3. **`src/routers/bc_routes/rgmc_contact_v2_routes.py`** — `list_rgmc_contacts_v2()` same GCS-first pattern:
   - Added `modified_since` query param
   - Skips GCS if `filter` or `select` params are present

4. **`src/routers/bc_routes/item_category_routes.py`** — `list_item_categories()` same pattern:
   - Added `modified_since` query param
   - Skips GCS if `filter` or `select` params are present

### Worker Pool (`C:\claude\rgmc-worker-pool`)

**Latest commit**: `c3ded90` — "sync customers, contacts, item categories to GCS on routine sync"

**What changed:**

1. **`src/services/bc_client.py`** — Added 3 new fetch functions (before the Order CRUD section):
   - `fetch_customers(company_name)` → calls `_RGMC_CUSTOM_API_V2/companies({id})/customers` via `_fetch_all_pages`
   - `fetch_contacts(company_name)` → calls `_RGMC_CUSTOM_API_V2/companies({id})/contacts` via `_fetch_all_pages`
   - `fetch_item_categories(company_name)` → calls `api/v2.0/companies({id})/itemCategories` via `_fetch_all_pages`

2. **`src/services/gcs_catalog.py`** — Added 3 save functions at the end (worker-pool side write functions):
   - `save_customers(company, customers)` → `{GCP_ENV}/{COMPANY}/customers.json`
   - `save_contacts(company, contacts)` → `{GCP_ENV}/{COMPANY}/contacts.json`
   - `save_item_categories(company, categories)` → `{GCP_ENV}/{COMPANY}/item_categories.json`

3. **`src/workers/sync_worker.py`** — `_sync_company()` now runs 3 extra steps after ILE sync:
   - Each in its own `try/except` block (failure in one doesn't block others)
   - `fetch_customers(company)` → `save_customers(company, ...)`
   - `fetch_contacts(company)` → `save_contacts(company, ...)`
   - `fetch_item_categories(company)` → `save_item_categories(company, ...)`
   - Updated imports at top of file

**GCS blobs will NOT exist until the worker pool runs `_sync_company` post-deploy. Before that, all three BC API endpoints fall through to BC (current behavior, no regression).**

### Prior session commits still undeployed:
- BC API `ae7cfda` — `POST /internal/sync/backfill-ile-columns` endpoint (was confirmed live in `00186-n8c`, already deployed)
- Worker pool `0edd66b` — ILE fix (already deployed earlier)

---

## Files Actively Being Edited

All committed. No mid-edit state.

**BC API (`C:\claude\rgmc-bc-api`):**
- `src/services/gcs_catalog.py` — Added load/cache/evict for customers, contacts, item_categories. ✅ `67de54e`
- `src/routers/bc_routes/rgmc_customer_v2_routes.py` — GCS-first list_customers, added modified_since param. ✅ `67de54e`
- `src/routers/bc_routes/rgmc_contact_v2_routes.py` — GCS-first list_rgmc_contacts_v2, added modified_since param. ✅ `67de54e`
- `src/routers/bc_routes/item_category_routes.py` — GCS-first list_item_categories, added modified_since param. ✅ `67de54e`

**Worker Pool (`C:\claude\rgmc-worker-pool`):**
- `src/services/bc_client.py` — Added fetch_customers, fetch_contacts, fetch_item_categories. ✅ `c3ded90`
- `src/services/gcs_catalog.py` — Added save_customers, save_contacts, save_item_categories. ✅ `c3ded90`
- `src/workers/sync_worker.py` — Added GCS sync for customers/contacts/categories in _sync_company, updated imports. ✅ `c3ded90`

---

## Failed Attempts

- **What was tried**: Running `gcloud run deploy` via Bash tool — **Why it failed**: Bash uses POSIX paths, not Windows paths. PowerShell is required for all gcloud and git commands on this machine.

---

## Next Step

**Deploy both services to Cloud Run production.** Run these two PowerShell commands (sequentially — BC API first, then worker pool):

```powershell
Set-Location "C:\claude\rgmc-bc-api"
gcloud run deploy rgmc-bc-api-prod --source . --region asia-southeast1
```

```powershell
Set-Location "C:\claude\rgmc-worker-pool"
gcloud run deploy rgmc-worker-pool-prod --source . --region asia-southeast1
```

After both are deployed, **trigger a routine sync to populate the new GCS blobs**:

```powershell
Invoke-RestMethod -Uri "https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app/internal/firestore/routine-sync" -Method POST -Headers @{ "X-Task-Secret" = "68dbf91ade93cfe52c8a37b8309bbc17b7a8db4320d1c6d130ce0f54ffb9ac84" } -Body '{"on_date": "2026-09-04"}' -ContentType "application/json"
```

Then verify the new GCS blobs exist by checking the healthcheck:

```powershell
Invoke-RestMethod -Uri "https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app/healthcheck/gcs" -Method GET | ConvertTo-Json -Depth 3
```

Should show `customers.json`, `contacts.json`, `item_categories.json` blobs per company in the blob list.

Then verify GCS-served response on the BC API:

```powershell
Invoke-RestMethod -Uri "https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app/bc/custom/v2/customers?company=RGMC" -Method GET | ConvertTo-Json -Depth 2
```

Should be fast (~200ms, from GCS) rather than slow (2-5s, from BC).

---

## Context & Gotchas

- **Two repos + one webapp**: `C:\claude\rgmc-consignment-webapp` (webapp, no changes this session), `C:\claude\rgmc-bc-api` (BC API), `C:\claude\rgmc-worker-pool` (worker pool). Deploy independently.
- **BC API prod URL**: `https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app`
- **Webapp prod URL**: `https://rgmc-consignment-prod-935246372408.asia-southeast1.run.app`
- **Task secret**: `68dbf91ade93cfe52c8a37b8309bbc17b7a8db4320d1c6d130ce0f54ffb9ac84` (also in `credentials.txt`, gitignored)
- **GCS blobs not populated until first post-deploy routine sync**: Until the worker pool runs `_sync_company` for each company, the new `customers.json` / `contacts.json` / `item_categories.json` blobs won't exist. During this window the BC API falls back to BC directly (no regression from current behavior).
- **5-minute in-process memory cache**: After loading from GCS, each BC API instance caches the data in-process for 5 minutes. After a worker pool sync writes fresh GCS blobs, users will see updated data within 5 minutes (next cache expiry).
- **`modified_since` comparison**: ISO 8601 string comparison `>` works correctly for UTC timestamps with Z suffix (standard BC format). If BC returns timestamps with timezone offsets, comparison may be imprecise — but the webapp's merge/upsert behavior makes this non-fatal (extra records get merged harmlessly).
- **GCS-first bypass conditions**: Raw OData `filter` or `$select` params force BC fallback so admin/internal tools that use OData filtering still get live BC data.
- **Worker pool `max_messages=1`**: Still sequential — all 5 companies process one after another in a single Pub/Sub message. Each company now runs 7 steps (headers, items, v3 catalog, ILE, customers, contacts, item categories). Routine sync will take slightly longer per run but GCS makes the BC API side much faster for end users.
- **Cloud Run cold start**: Root cause of "slow sync" user perception — container idles after ~15 min, first request pays 10-30s warmup. With GCS caching, even the cold-start first request for customers/contacts/categories is ~200ms instead of 2-5s BC hit.
- **`withTimeout` sentinel in SplashPage.vue**: Uses `err.message === '__timeout__'` — don't change this string.
- **Stack**: Ionic 7 + Vue 3 + Pinia + TypeScript frontend. FastAPI Python backend (GCP Cloud Run). Business Central OData v4. Firestore + GCS for price catalog. Worker pool = separate Cloud Run service consuming Pub/Sub.
