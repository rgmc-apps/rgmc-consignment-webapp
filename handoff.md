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

---

## Files Actively Being Edited

All committed and stable.

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `views/SplashPage.vue` — removed `hasLocalCache` guard; authenticated users always skip to home
- `views/ScanningPage.vue` — added `canScan` computed; updated state card and scan form conditions
- `views/HistoryPage.vue` — added BC Orders tab with date picker, order list, and detail modal
- `services/api.service.ts` — 180s timeout on submit calls; 4 new BC order lookup methods

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `routers/bc_routes/sales_order_routes.py` — `ThreadPoolExecutor(max_workers=3)` for parallel line creation
- `routers/bc_routes/rgmc_sales_return_order_v2_routes.py` — same parallel pattern using v2 functions

---

## Failed Attempts

- **PowerShell heredoc with bash syntax** (`$(cat <<'EOF')`) — parse error. Must use PowerShell's `@'...'@` here-string for `git commit -m`.
- **Edit tool "string not found" on bc routes** — em dash encoding mismatch (`—` vs `—`). Fixed by re-reading file to get exact bytes.

---

## Next Step

**No immediate blocking task.** The most valuable next step from the backlog is:

**Implement GCP Layer 2A (Cloud Run single-instance)** — documented in `C:\claude\rgmc-bc-api\consignment-infra.md`:
1. Cloud Run → `rgmc-bc-api` service → Edit & Deploy New Revision
2. Set Max instances = 1, Min instances = 1, Concurrency = 6
3. Deploy

This makes `_bc_semaphore(4)` a true global BC connection limiter and eliminates most 429 errors. No code change required.

**OR** implement Layer 2B (GCS catalog backup) — requires new Python code in `bc_functions.py` to persist the v3 item price catalog to a GCS bucket so restarts don't hit BC cold.

Also still pending: commit the untracked `C:\claude\rgmc-bc-api\consignment-infra.md`:
```powershell
git -C C:\claude\rgmc-bc-api add consignment-infra.md
git -C C:\claude\rgmc-bc-api commit -m "add GCP infra hardening plan for BC rate limit resilience"
```

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

### `_block_until_v3_catalog_ready` (backend, post prior-session fix)
- Polls every 300ms, timeout 55s (under nginx 60s proxy_read_timeout)
- Re-triggers on fetch failure as long as >8s remain on deadline
- Returns None (→ 503) only if deadline expires with no cached data

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — full Layer 2A–2D hardening guide. Still untracked (not committed). Layer 2A is the highest-priority, zero-code win.
