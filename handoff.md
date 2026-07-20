# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, stability, and reliability — correct item prices, stable sync, responsive UI, and resilience against BC API limitations.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos have uncommitted commits that need to be pushed to `origin/master`.**

### What was done in this session (July 20, 2026):

**Layer 2D: Cloud Tasks async order submission (fully wired)**
- `task_service.py`: `enqueue_order()` now uses `CLOUD_TASKS_ORDER_QUEUE`; added `enqueue_catalog_sync(company)` targeting `CLOUD_TASKS_SYNC_QUEUE`
- `config.py`: renamed `CLOUD_TASKS_QUEUE` → `CLOUD_TASKS_ORDER_QUEUE`; added `CLOUD_TASKS_SYNC_QUEUE = "bc-sync-queue"`; added `BC_COMPANIES` env var (comma-separated list for preload)
- `task_routes.py`: ClientDisconnect fix (wrap `body = await request.json()` in try/except, return 503); added `/internal/sync/trigger` (Cloud Scheduler target); added `/internal/tasks/sync-catalog/{task_id}` (bc-sync-queue target calling `rgmc_v3_warmup`); v1/v2 task routing correctly sets `salesReturnOrders`/`salesReturnOrderLines` for returns
- `rgmc_sales_order_routes.py` + `rgmc_sales_order_v2_routes.py`: added `enqueue_order` + `/submit` endpoint; replaced silent line failure with ThreadPoolExecutor(max_workers=2) + 4-attempt 409 retry + full order rollback
- Frontend `api.service.ts`: added `submitSalesOrderAsync`, `submitSalesReturnOrderAsync`, `pollTask` methods
- Frontend `SubmitPage.vue`: `doSubmitSales` + `doSubmitReturns` use async submit with `pollUntilDone` (3s poll, 5min timeout)

**Layer 2B: GCS catalog persistence**
- `gcs_catalog.py`: added `logger.warning(...)` to `load_catalog` and `save_catalog` early returns (previously silent on missing env var)
- `health.py`: added `/healthcheck/gcs` (lists all blobs across all companies); `/healthcheck/tasks` (tests Cloud Tasks + Firestore connectivity)

**v3 catalog performance improvements** (`55ffdd3` in bc-api)
- `bc_functions.py`:
  - Added `from concurrent.futures import ThreadPoolExecutor, as_completed`
  - `_V3_PREFER_HEADER`: `odata.maxpagesize=500` → `1000` (halves OData roundtrips)
  - `_fetch_v3_catalog_parallel`: rewritten to fetch two parallel productNo range requests (`lt 'M'` and `ge 'M'`) using ThreadPoolExecutor(max_workers=2); merges + deduplicates on productNo
  - `preload_from_gcs(company_names)`: startup function that loads GCS catalog into in-memory cache, then triggers background BC refresh
- `main.py`: added FastAPI lifespan context manager calling `preload_from_gcs` in a background thread for all companies in `BC_COMPANIES`

**Previous session work (July 17–18, 2026):**

**Splash screen loop fix** (`17768f6` in consignment-webapp)

**Sales order submission timeout fix** (`fc8972f` + `3a60293`)

**BC Orders tab in History page** (`e608476`)

**Online mode sync gate removed** (`f57c5f4`)

**BC API 409 / 401 / timeout fixes** (`c8e6e38`, `c565b3e`, `56bf0ea`, `eaac493`)

**Frontend sync simplified + paginated** (`add86c6`, `f693dbb`)

**Backend: single worker, warmup, longer TTL** (`eaac493`)

---

## Files Actively Being Edited

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `views/SubmitPage.vue`
- `services/api.service.ts`

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `services/bc_functions.py`
- `services/task_service.py`
- `services/gcs_catalog.py`
- `routers/bc_routes/task_routes.py`
- `routers/bc_routes/rgmc_sales_order_routes.py`
- `routers/bc_routes/rgmc_sales_order_v2_routes.py`
- `routers/bc_routes/rgmc_sales_return_order_v2_routes.py`
- `config.py`
- `main.py`

---

## Failed Attempts

- **PowerShell heredoc with bash syntax** (`$(cat <<'EOF')`) — parse error. Must use PowerShell's `@'...'@` here-string for `git commit -m`.
- **Edit tool "string not found" on bc routes** — em dash encoding mismatch. Fixed by re-reading file to get exact bytes.
- **3 gunicorn workers**: Each worker got its own isolated cache. Reverted to `workers=1`.
- **BC-native `bc_limit`/`bc_offset` pagination**: Every page hits BC. Use Python-level `skip`/`limit` slicing from cache.
- **`--max-retry-duration=5m`** for gcloud tasks queues create — invalid. Must use seconds (`300s`, `3600s`).

---

## Next Steps

### GCP setup still needed by user:

1. **Set `BC_COMPANIES` env var on Cloud Run** — comma-separated list: `RGMC,CGI` (or whichever companies exist)
2. **Trigger first GCS catalog population** — hit `POST /internal/sync/trigger` with `{"companies": ["RGMC", "CGI"]}` and `X-Task-Secret` header, OR wait for Cloud Scheduler to run
3. **Cloud Scheduler setup (Layer 2C)** — create `bc-catalog-prewarm` job:
   - Target: `POST https://<your-cloud-run-url>/internal/sync/trigger`
   - Body: `{"companies": ["RGMC", "CGI"]}`
   - Headers: `X-Task-Secret: <your-secret>`
   - Schedule: every 12 hours (or nightly)
4. **Verify Cloud Run service account** has `Storage Object User` role on `rgmc-bc-catalog` bucket (needed for GCS catalog reads/writes)
5. **Push both repos** to `origin/master` when ready to deploy

### Cloud Run env vars to confirm/add:
- `BC_COMPANIES=RGMC,CGI` (new — needed for startup preload)
- `CLOUD_TASKS_ORDER_QUEUE=bc-order-queue` (renamed from `CLOUD_TASKS_QUEUE`)
- `CLOUD_TASKS_SYNC_QUEUE=bc-sync-queue` (new)
- `GCS_CATALOG_BUCKET=rgmc-bc-catalog`
- `GCP_ENV=Production`

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that builds a temp buffer — inherently slow cold. Backend in-memory cache is the primary mitigation.
- `familyCode` cannot be sent as an OData filter to BC (temp-buffer field). Backend always fetches full catalog and filters in Python.
- Pag50318 DOES support `productNo ge/lt` range filters — enables parallel range fetches.

### Two Cloud Tasks queues
- `bc-order-queue`: sales/return order submission. max-concurrent=5, max-attempts=3, max-retry-duration=300s
- `bc-sync-queue`: v3 catalog sync. max-concurrent=2, max-attempts=5, max-retry-duration=3600s
- Both share `TASK_SECRET` header for auth (`X-Task-Secret`)

### Async order submission flow
1. Frontend calls `/bc/custom/v2/sales-orders/submit` (or `/submit` on sales-return-orders) → gets `{taskId, status: "queued"}`
2. Frontend polls `GET /tasks/{taskId}` every 3s up to 5 min
3. Cloud Tasks calls `POST /internal/tasks/process-order/{task_id}` — creates BC header + lines sequentially with 409 retry + rollback
4. Firestore tracks status: `queued → processing → done/failed`

### App modes
- `appMode` from `useAppModeStore`: `'online'` | `'offline'`
- **Online**: items fetched live; no local item cache needed. Customers/categories still from local cache.
- **Offline**: all data from local sync cache.

### BC connection limit
- BC enforces ~5 simultaneous connections per API user.
- `_bc_semaphore = threading.Semaphore(3)` is per-process (changed from 4).
- Cloud Run must stay at max-instances=1 to prevent semaphore bypass.

### BC date filter syntax
- OData dates are **unquoted**: `postingDate eq 2026-07-17`
- Quoted (`postingDate eq '2026-07-17'`) returns 0 results.

### `hasCache` vs `canScan` (ScanningPage)
- `hasCache` = all three caches populated
- `canScan` = `hasCache || (online mode && connected)`

### `lineNo` and parallel line creation
- `lineNo = i * 10000` so parallel creation order doesn't affect line order in BC.

### BC API field names (custom pages)
- Sales order header: `no`, `sellToCustomerNo`, `sellToCustomerName`, `postingDate`

### `useSync` is a module-level singleton
All refs live outside the `useSync()` function body — shared across all components.

### BC "External Document No." field
35 characters max — base table limit. `RemarksModal.vue` enforces `maxlength="35"`.

### `_block_until_v3_catalog_ready` (backend)
- Polls every 300ms, timeout 55s (under nginx 60s proxy_read_timeout)
- Tries GCS first (~200ms) before waiting on BC (6-20s)
- Re-triggers on fetch failure if >8s remain

### Python-level vs BC-native pagination
- `skip`/`limit` (Python-level): slices from in-memory cache — only page 1 hits BC.
- `bc_limit`/`bc_offset` (BC-native): bypasses cache — every page round-trips to BC. Avoid.

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — Layer 2A–2D hardening guide.
