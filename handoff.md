# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, stability, and reliability — correct item prices, stable sync, responsive UI, and resilience against BC API limitations.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos are committed and pushed on `master`. Clean state — no pending changes.**

### What was done in this session (July 17–20, 2026):

**Splash screen loop fix** (`17768f6` in consignment-webapp)
- Removed `hasLocalCache` requirement from `SplashPage.vue` `onMounted`. Authenticated users now always fast-exit to `/app/home` regardless of whether items are in cache. The home screen handles missing cache via its own sync button.

**Sales order submission timeout fix** (`fc8972f` in consignment-webapp; `3a60293` in bc-api)
- Root cause: 10+ line items × ~4-6s per BC call = timeout at 60s. Fix was two-pronged:
  1. Frontend: added `{ timeout: 180_000 }` to `submitSalesOrder` and `submitSalesReturnOrder` in `api.service.ts`
  2. Backend: replaced sequential line creation with `ThreadPoolExecutor(max_workers=3)` in both `sales_order_routes.py` and `rgmc_sales_return_order_v2_routes.py`. `lineNo` is explicitly set as `i * 10000` so parallel creation is safe. Rollback (delete order) on partial failure.

**BC Orders tab added to History page** (`e608476` in consignment-webapp)
- `HistoryPage.vue` now has a "BC Orders" chip/tab that queries live BC data by posting date.
- Fetches sales orders (`GET /bc/sales-orders?filter=postingDate eq YYYY-MM-DD`) and return orders (`GET /bc/custom/v2/sales-return-orders?filter=postingDate eq YYYY-MM-DD`).
- Detail modal fetches and shows line items for the selected order.
- New `ApiService` methods: `getBCSalesOrders`, `getBCSalesReturnOrders`, `getBCSalesOrderLines`, `getBCSalesReturnOrderLines`.
- BC date filter uses **unquoted** ISO dates: `postingDate eq 2026-07-17` (not quoted strings).

**Online mode sync gate removed from Scan page** (`f57c5f4` in consignment-webapp)
- `ScanningPage.vue` now has a `canScan` computed alongside `hasCache`:
  ```typescript
  const canScan = computed(
    () => hasCache.value || (appMode.value === 'online' && isOnline.value),
  );
  ```
- State card and scan form template now use `canScan` instead of `hasCache`.
- In online mode + connected: scan form shows immediately; `ItemSelectorModal` fetches items live via pagination.
- In online mode + offline (no internet): state card shows "Offline" warning, Sync button hidden.
- Offline mode behavior unchanged.

**BC API 409 / 401 / timeout fixes** (multiple bc-api commits: `c8e6e38`, `c565b3e`, `56bf0ea`, `eaac493`)
- **409 on parallel line creation**: `_create_line` in both `sales_order_routes.py` and `rgmc_sales_return_order_v2_routes.py` now retries 409 up to 3 times with 0.5s/1s/1.5s backoff (BC optimistic concurrency lock).
- **401 transient errors**: `get_access_token(force_refresh=False)` added; `_bc_request` and `_fetch_all_pages` now retry on 401 by force-refreshing the OAuth token immediately.
- **409 on Pag50318 `$skiptoken` pagination**: `_fetch_all_pages` now restarts from page 1 on 409 (up to 3 restarts, 1s delay) — BC temp-buffer cursor invalidated by concurrent requests.

**Frontend sync simplified + paginated** (`add86c6`, `f693dbb` in consignment-webapp)
- `useSync.ts`: replaced complex adaptive pagination with `Promise.allSettled` of 4 parallel tasks. Axios default timeout raised to 120s.
- Items fetch uses sequential `getItemsPaged` calls (PAGE_SIZE=500); new `ApiService.getItemsPaged()` method using Python-level `skip`/`limit` params. First page warms backend cache; subsequent pages are instant cache hits.
- TIMEOUT = 180_000 for all sync tasks.

**Backend performance: single worker, warmup, longer TTL** (`eaac493` in bc-api)
- `gunicorn_config.py`: `workers=1`, `threads=4`, `timeout=180` — single worker so all requests share one in-memory cache and one `_bc_semaphore(4)` (correctly caps BC at 4 concurrent connections).
- `config.py`: `BC_WARMUP_COMPANIES = ["LGAP", "RGMC"]` from env var.
- `bc_functions.py`: `_LIST_CACHE_TTL = 1800` (was 300). Added `warmup_all_companies()` that pre-populates all caches for all companies.
- `main.py`: `@api.on_event("startup")` runs `warmup_all_companies` in background thread; `_warmup_loop` re-warms every 30 min.

**GCP infra doc committed** (bc-api, already tracked)
- `consignment-infra.md` — Layer 2A–2D hardening guide. Layer 2A (Cloud Run max-instances=1) is the next highest-priority action but requires user action in GCP console.

---

## Files Actively Being Edited

All committed and stable.

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `views/SplashPage.vue`
- `views/ScanningPage.vue`
- `views/HistoryPage.vue`
- `services/api.service.ts`
- `composables/useSync.ts`

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `routers/bc_routes/sales_order_routes.py`
- `routers/bc_routes/rgmc_sales_return_order_v2_routes.py`
- `services/bc_functions.py`
- `gunicorn_config.py`
- `config.py`
- `main.py`

---

## Failed Attempts

- **PowerShell heredoc with bash syntax** (`$(cat <<'EOF')`) — parse error. Must use PowerShell's `@'...'@` here-string for `git commit -m`.
- **Edit tool "string not found" on bc routes** — em dash encoding mismatch (`—` vs `—`). Fixed by re-reading file to get exact bytes.
- **3 gunicorn workers**: Each worker got its own isolated cache and semaphore — warmup in worker 1 didn't help workers 2/3, and 3×semaphore(4)=12 potential BC connections vs the ~5 BC allows. Reverted to `workers=1`.
- **BC-native `bc_limit`/`bc_offset` pagination**: Bypasses backend in-memory cache — every page hits BC. Use Python-level `skip`/`limit` slicing from cache instead.

---

## Next Step

**GCP Layer 2A (Cloud Run single-instance)** — requires user action in GCP console:
1. Cloud Run → `rgmc-bc-api` service → Edit & Deploy New Revision
2. Set Max instances = 1, Min instances = 1, Concurrency = 6
3. Deploy

This ensures `_bc_semaphore(4)` is a true global BC connection limiter. The code change (`workers=1`) is already deployed; the GCP setting prevents Cloud Run from spinning up a second instance under load.

**Optional Layer 2B (GCS catalog backup)** — code work:
- Persist the v3 item price catalog to a GCS bucket on warmup.
- On cold start, load from GCS if BC is unavailable.
- Requires new Python code in `bc_functions.py` + GCS client library.

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that builds a temp buffer — inherently slow cold. Backend in-memory cache is the primary mitigation.
- `familyCode` cannot be sent as an OData filter to BC (it's a temp-buffer field). Backend always fetches full catalog and filters in Python.

### App modes
- `appMode` from `useAppModeStore`: `'online'` | `'offline'`
- **Online**: items fetched live by `ItemSelectorModal` via `ApiService.getItemsPage()` (pagination). No local item cache needed. Customers and categories still come from local cache.
- **Offline**: items, customers, categories all come from local sync cache.

### BC connection limit
- BC enforces ~5 simultaneous connections per API user.
- `_bc_semaphore = threading.Semaphore(4)` is per-process. If Cloud Run scales to 2+ instances → up to 8 concurrent → 429.
- `ThreadPoolExecutor(max_workers=3)` for line creation is bounded by the semaphore.

### BC date filter syntax
- OData dates are **unquoted**: `postingDate eq 2026-07-17`
- If you quote them (`postingDate eq '2026-07-17'`) BC returns 0 results or errors.

### `hasCache` vs `canScan` (ScanningPage)
- `hasCache` = all three caches populated (items + customers + categories)
- `canScan` = `hasCache || (online mode && connected)` — used for showing scan UI
- `hasCache` is still used internally for logic that specifically needs the local cache (e.g., network notice banner copy)

### `lineNo` and parallel line creation
- `lineNo` is explicitly set as `i * 10000` (1=10000, 2=20000, etc.) so parallel creation order doesn't matter — BC orders lines by `lineNo`, not insertion order.

### BC API field names (custom pages)
- Sales order header: `no` = document number, `sellToCustomerNo`, `sellToCustomerName`, `postingDate`
- Lines from BC come back with BC field names (not camelCase frontend names)

### `useSync` is a module-level singleton
All refs (`isSyncing`, `syncProgress`, etc.) live outside the `useSync()` function body and are shared across all components.

### BC "External Document No." field
35 characters max — base table limit. `RemarksModal.vue` enforces `maxlength="35"`.

### `_block_until_v3_catalog_ready` (backend)
- Polls every 300ms, timeout 55s (under nginx 60s proxy_read_timeout)
- Re-triggers on fetch failure as long as >8s remain on deadline
- Returns None (→ 503) only if deadline expires with no cached data

### Python-level vs BC-native pagination
- `skip`/`limit` (Python-level): slices from backend in-memory cache — only page 1 hits BC (warms cache); all subsequent pages are instant.
- `bc_limit`/`bc_offset` (BC-native): bypasses cache entirely — every page round-trips to BC. Avoid.

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — committed. Full Layer 2A–2D hardening guide.
