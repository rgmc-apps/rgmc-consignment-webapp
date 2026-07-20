# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, stability, and reliability — correct item prices, stable sync, responsive UI, and resilience against BC API limitations.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos are committed and pushed on `master`. Clean state — no pending changes.**

### What was done in this session (July 20, 2026):

**Layer 2D: Cloud Tasks async order submission (fully wired)**
- `task_service.py`: `enqueue_order()` uses `CLOUD_TASKS_ORDER_QUEUE`; `enqueue_catalog_sync(company)` targets `CLOUD_TASKS_SYNC_QUEUE`
- `config.py`: renamed `CLOUD_TASKS_QUEUE` → `CLOUD_TASKS_ORDER_QUEUE`; added `CLOUD_TASKS_SYNC_QUEUE = "bc-sync-queue"`; added `BC_COMPANIES` env var
- `task_routes.py`: ClientDisconnect fix (wrap `body = await request.json()` in try/except → 503); `/internal/sync/trigger` (Cloud Scheduler target); `/internal/tasks/sync-catalog/{task_id}` (bc-sync-queue target calling `rgmc_v3_warmup`); v1/v2 both correctly set `salesReturnOrders`/`salesReturnOrderLines` for returns
- `rgmc_sales_order_routes.py` + `rgmc_sales_order_v2_routes.py`: added `enqueue_order` + `/submit` endpoint; ThreadPoolExecutor(max_workers=2) + 4-attempt 409 retry + full order rollback on line failure
- Frontend `api.service.ts`: added `submitSalesOrderAsync`, `submitSalesReturnOrderAsync`, `pollTask` methods
- Frontend `SubmitPage.vue`: both `doSubmitSales` + `doSubmitReturns` use async submit + `pollUntilDone` (polls every 3s, 5min timeout)

**Layer 2B: GCS catalog persistence**
- `gcs_catalog.py`: both `load_catalog` and `save_catalog` now log `logger.warning(...)` on missing bucket env var (previously silent)
- `health.py`: `/healthcheck/gcs` (lists all blobs across all companies); `/healthcheck/tasks` (tests Cloud Tasks + Firestore connectivity)

**v3 catalog performance improvements** (commit `55ffdd3` in bc-api)
- `bc_functions.py`:
  - Added `from concurrent.futures import ThreadPoolExecutor, as_completed`
  - `_V3_PREFER_HEADER`: `odata.maxpagesize=500` → `1000` (halves OData roundtrips)
  - `_fetch_v3_catalog_parallel`: rewritten — two concurrent BC requests splitting on `productNo lt 'M'` / `productNo ge 'M'` via `ThreadPoolExecutor(max_workers=2)`; merges + deduplicates on `productNo`
  - `preload_from_gcs(company_names)`: new startup function — loads GCS catalog into in-memory cache per company at boot, then triggers background BC refresh
- `config.py`: added `BC_COMPANIES = os.getenv("BC_COMPANIES", "")` (comma-separated, fallback to `BC_COMPANY`)
- `main.py`: FastAPI lifespan context manager calls `preload_from_gcs` in a background thread for all companies in `BC_COMPANIES`

**familyCode always passed on frontend item price calls** (commit `94cc94e` in consignment-webapp)
- `api.service.ts`: `getItemsPaged()` now accepts `familyCode?` as last param and forwards as `family_code` query param
- `useSync.ts`: both `getItemsPaged()` calls (first page and subsequent pages) now pass `brandCode` (from `authStore.brand?.code`)
- `ItemSelectorModal.vue`: `fetchMissingPrices()` passes `props.familyCode` to `getAllItemPricesForDate()`

**familyCode pipeline fixes in bc_functions.py** (commit `25f7dbd` in bc-api)
- `_rgmc_v3_build_url`: **removed** `familyCode eq '{family_code}'` OData clause — `familyCode` is a computed temp-buffer field in Pag50318's OnOpenPage; BC rejects it in any OData `$filter`. Was silently being sent in two paths before this fix.
- `bc_limit/bc_offset` short-circuit in `rgmc_v3_list_item_prices`: now passes `None` for family_code to URL builder, then filters the BC response in Python (`[r for r in records if r.get("familyCode") == family_code]`)
- Step 6 synchronous fallback in `rgmc_v3_list_item_prices`: same fix — fetches without family_code, filters after
- `rgmc_v3_get_item_price_count`: when `family_code` is provided, now derives count from in-memory full-catalog cache filtered in Python instead of calling Pag50319 and returning the unfiltered total. If cache isn't populated, triggers warmup and returns 0.

---

## Files Actively Being Edited

All committed and stable. No files are mid-change.

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `views/SubmitPage.vue` — async submit + pollUntilDone (done)
- `services/api.service.ts` — submitSalesOrderAsync, submitSalesReturnOrderAsync, pollTask, familyCode in getItemsPaged (done)
- `composables/useSync.ts` — passes brandCode to all getItemsPaged calls (done)
- `components/ItemSelectorModal.vue` — passes familyCode to fetchMissingPrices (done)

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `services/bc_functions.py` — parallel fetch, page size 1000, preload_from_gcs, familyCode URL fix, count fix (done)
- `services/task_service.py` — two-queue support (done)
- `services/gcs_catalog.py` — warning logs on missing bucket (done)
- `routers/bc_routes/task_routes.py` — ClientDisconnect fix, sync/trigger, sync-catalog endpoints (done)
- `routers/bc_routes/rgmc_sales_order_routes.py` — /submit + retry/rollback (done)
- `routers/bc_routes/rgmc_sales_order_v2_routes.py` — /submit + retry/rollback (done)
- `config.py` — BC_COMPANIES, CLOUD_TASKS_ORDER_QUEUE, CLOUD_TASKS_SYNC_QUEUE (done)
- `main.py` — lifespan + preload_from_gcs (done)

---

## Failed Attempts

- **PowerShell `$(cat <<'EOF')` heredoc for git commit messages** — parse error ("Missing file specification after redirection operator"). Must use PowerShell's `@'...'@` here-string syntax, or backtick multiline string.
- **Edit tool on em-dash characters in bc routes** — "string not found" error due to encoding mismatch between `—` (em dash) and `—`. Fixed by re-reading the file with the Read tool first to get exact bytes before editing.
- **3 gunicorn workers** — each worker gets its own isolated in-memory cache and semaphore. `_bc_semaphore(4)` becomes effectively `_bc_semaphore(12)` under load, exceeding BC's ~5-connection limit. Reverted to `workers=1`.
- **BC-native `bc_limit`/`bc_offset` pagination** — bypasses backend in-memory cache entirely; every page round-trips to BC. Use Python-level `skip`/`limit` slicing from cache instead.
- **`--max-retry-duration=5m`** for gcloud tasks queues create — invalid format. Must use seconds notation: `300s`, `3600s`.
- **`familyCode eq '{family_code}'` in OData URL to BC** — BC rejects OData filters on temp-buffer fields (those computed during OnOpenPage). `familyCode` in Pag50318 is computed in the trigger, not stored in a real table column, so BC's OData engine can't filter it server-side.

---

## Next Steps

### GCP setup needed (user action required):

1. **Add `BC_COMPANIES` env var to Cloud Run** — set to comma-separated company list: e.g. `RGMC,CGI`
   - Cloud Run → `rgmc-bc-api` → Edit & Deploy New Revision → Environment variables
   - This enables the startup preload from GCS and background refresh on boot

2. **Rename `CLOUD_TASKS_QUEUE` → `CLOUD_TASKS_ORDER_QUEUE`** in Cloud Run env vars (code now reads `CLOUD_TASKS_ORDER_QUEUE`)

3. **Add `CLOUD_TASKS_SYNC_QUEUE=bc-sync-queue`** to Cloud Run env vars

4. **Trigger first GCS catalog population** — the GCS bucket exists but may have no catalog file yet per company. Options:
   - Hit `POST /internal/sync/trigger` with body `{"companies": ["RGMC", "CGI"]}` and header `X-Task-Secret: <your-secret>`
   - OR wait for the Cloud Scheduler job to run (Layer 2C below)
   - Verify with `GET /healthcheck/gcs`

5. **Cloud Scheduler setup (Layer 2C)** — create `bc-catalog-prewarm` job:
   - Target: `POST https://<cloud-run-url>/internal/sync/trigger`
   - Body: `{"companies": ["RGMC", "CGI"]}`
   - Headers: `X-Task-Secret: <your-secret>`
   - Schedule: `0 */12 * * *` (every 12 hours)

6. **Verify Cloud Run service account** has `Storage Object User` role on `rgmc-bc-catalog` bucket (required for GCS catalog reads/writes at startup and after warmup)

7. **Layer 2A (Cloud Run single-instance)** — still needs GCP console action:
   - Cloud Run → `rgmc-bc-api` → Edit & Deploy New Revision
   - Max instances = 1, Min instances = 1, Concurrency = 6

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that builds a temp buffer table — inherently slow cold. Backend in-memory cache is the primary mitigation.
- `familyCode` in Pag50318 is a **computed temp-buffer field** — it is populated during the OnOpenPage trigger by joining against the item table. BC's OData engine rejects it as a `$filter` parameter. All familyCode filtering must be done in Python against the full catalog cache.
- `productNo ge/lt` range filters ARE supported by Pag50318's OnOpenPage (they scan at the SQL level before inserting into the temp buffer). This is what enables the parallel catalog fetch.

### Two Cloud Tasks queues
- `bc-order-queue`: sales/return order submission. `max-concurrent=5`, `max-attempts=3`, `max-retry-duration=300s`
- `bc-sync-queue`: v3 catalog sync/warmup. `max-concurrent=2`, `max-attempts=5`, `max-retry-duration=3600s`
- Both queues validate `X-Task-Secret` header against `TASK_SECRET` env var

### Async order submission flow
1. Frontend calls `/bc/custom/v2/sales-orders/submit` → gets `{taskId, status: "queued"}`
2. Frontend polls `GET /tasks/{taskId}` every 3s up to 5 min
3. Cloud Tasks calls `POST /internal/tasks/process-order/{task_id}` → creates BC header + lines sequentially with 409 retry (4 attempts, 0.5s/1s/1.5s backoff) + rollback on failure
4. Firestore tracks task state: `queued → processing → done / failed`

### App modes
- `appMode` from `useAppModeStore`: `'online'` | `'offline'`
- **Online**: items fetched live by `ItemSelectorModal` via paginated BC calls. No local item cache needed. Customers and categories still from local cache.
- **Offline**: all data (items, customers, categories) from local sync cache.

### familyCode / brandCode in frontend
- `authStore.brand?.code` — the brand's short code (e.g. "RGMC"). This is what gets passed as `family_code` to the backend.
- `authStore.brand?.itemFamilyCode` — also exists on the `Brand` type, but the codebase consistently uses `brand.code` for item price filtering.
- `ScanningPage.vue` also does client-side filtering: `allItems.filter((i) => i.familyCode === brandCode)` after loading from local cache.

### BC connection limit
- BC enforces ~5 simultaneous connections per API user.
- `_bc_semaphore = threading.Semaphore(3)` in bc_functions.py gates all BC HTTP calls.
- Cloud Run must stay at `max-instances=1`. If it scales to 2 instances, the semaphore per-process means up to 6 concurrent BC connections → 429 errors.

### BC date filter syntax
- OData dates are **unquoted**: `postingDate eq 2026-07-17`
- Quoted dates (`postingDate eq '2026-07-17'`) return 0 results.

### `lineNo` and parallel line creation
- `lineNo = i * 10000` (1=10000, 2=20000, etc.) so BC orders lines by `lineNo` regardless of insertion order.

### `useSync` singleton pattern
- All refs (`isSyncing`, `syncProgress`, etc.) are **module-level** — defined outside `useSync()`. They are shared across all component instances. Any component calling `useSync()` sees the same state.

### Python-level vs BC-native pagination
- `skip`/`limit` (Python-level): slices from in-memory cache — only the first page ever hits BC (warms cache); all subsequent pages are instant cache hits.
- `bc_limit`/`bc_offset` (BC-native): bypasses cache entirely — every page round-trips to BC. Avoid using these from the frontend.

### `_block_until_v3_catalog_ready` behavior
- Polls every 300ms up to 55s (just under nginx's 60s proxy_read_timeout)
- Tries GCS first (~200ms) before waiting on a live BC fetch (6-20s after optimizations)
- Re-triggers the BC fetch if it fails and >8s remain on the deadline
- Returns `None` → 503 only if deadline expires with no data

### GCP project / resource names
- Project: `durable-woods-465907-n1`
- GCS catalog bucket: `rgmc-bc-catalog`
- Cloud Tasks location: set via `CLOUD_TASKS_LOCATION` env var
- `GCP_ENV` env var controls the GCS blob path prefix: e.g. `Production/{COMPANY}/catalog.json`

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — Layer 2A–2D hardening guide (committed).
