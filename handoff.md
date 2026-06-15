# Handoff

## Goal
RGMC Consignment Web App — Ionic/Vue PWA for sales reps to scan items and submit Sales Orders / Sales Return Orders to Business Central via a GCP FastAPI proxy. The app must work offline (using IndexedDB + localStorage caches), sync data on demand, and correctly submit all scanned item lines to BC.

Two bugs were fixed this session. The primary remaining concern is verifying that the GCP API line-creation fix actually surfaces the real BC error so the root cause can be eliminated at the BC/AL level (see Next Step).

---

## Current State

All TypeScript checks pass (`npx vue-tsc --noEmit` — clean).

### What is working
- **Draft auto-save on navigation**: When the user navigates away from ScanningPage (to profile, home, history, etc.), the current session is automatically saved as a draft if a customer is set.
- **"Start New Session" always creates a blank session**: The button now calls `sessionStore.clearCurrentSession()` before navigating to `/app/scan`, so `ScanningPage.onMounted` always sees no active session and calls `startNewSession()` fresh.
- **Error surfacing on multi-line order submission**: If BC rejects any line during order creation, the GCP API now rolls back (deletes the header) and returns a descriptive HTTP 502 to the frontend.
- **Safe JSON parsing in GCP API**: `rgmc_create_record` in `bc_functions.py` now uses `_safe_json()` so HTML/empty BC error bodies don't cause cryptic Python tracebacks.
- All previously implemented features (price sync, offline price fallback, reconnect price prompt, item remove button on SubmitPage, etc.) remain intact.

### What is unresolved / partially fixed
- **Root cause of single-line BC bug is still UNKNOWN**: The GCP API fix makes the error visible (returns 502 with BC's error message) but does not fix the underlying BC-side issue. The actual reason BC was rejecting lines 2+ has NOT been identified because we can't see live BC API responses. The fix will surface the real error on the next test submission.
- **`rgmc_sales_order_routes.py`** (at `/bc/custom/sales-orders`) was NOT modified — only `/bc/sales-orders` (`sales_order_routes.py`) was fixed, because that is what the frontend calls.

---

## Files Actively Being Edited

### Frontend — `C:\claude\rgmc-consignment-webapp`

- `src/stores/session.store.ts` — Added `autoSaveDraft()` public method (saves draft without clearing `currentSession`). Added it to the return object. This is distinct from `saveAsDraftAndExit()` which also nulls out `currentSession`.

- `src/views/ScanningPage.vue` — Added `onBeforeRouteLeave` import from `vue-router`. Added `onBeforeRouteLeave(() => { sessionStore.autoSaveDraft(); })` guard immediately after `saveDraftAndGoHome()` function (~line 691).

- `src/views/LandingPage.vue` — Changed "Start New Session" button from `router-link="/app/scan"` to `@click="startNewSession"`. Added `startNewSession()` function that calls `sessionStore.clearCurrentSession()` then `router.push('/app/scan')`.

### GCP API — `C:\RGMC\Source\git\rgmc-gcp-api`

- `src/routers/bc_routes/sales_order_routes.py` — Replaced silent `logger.error` on line-creation failure with a per-line try/except that: (1) raises `ValueError` on non-200/201 BC response, (2) calls `rgmc_delete_record` to roll back the order header, (3) raises `HTTPException(502)` with the BC error detail. Loop variable changed from `for line` to `for i, line in enumerate(lines, start=1)`.

- `src/routers/bc_routes/sales_return_order_routes.py` — Same change as above, matching pattern for return orders.

- `src/services/bc_functions.py` — Changed `rgmc_create_record` return from `response.json()` to `_safe_json(response)` (function already existed in the file at line ~187). This prevents `JSONDecodeError` when BC returns HTML/empty error bodies.

---

## Failed Attempts

- **Identifying the exact BC-side root cause of the single-line bug**: Could not determine whether the issue was (a) BC auto-creating a blank line that conflicts with the first POST, (b) BC's custom page requiring explicit `lineNo` per line, (c) a validation error on specific fields (e.g., `postingDate` format, unknown fields), or (d) a JSON decode error mid-loop causing a silent partial failure. Could not see live BC API responses. The fix was to surface whatever error BC returns rather than guess-and-patch at the API level.

- **Adding explicit `lineNo` values (10000, 20000, …) to each line payload**: Considered but not implemented because (a) `lineNo` is not in any of the Pydantic models, suggesting BC's custom page may not expose it, and (b) sending unknown fields to BC's strict OData API can itself cause 400 errors, potentially making things worse. Deferred until the actual BC error is visible via the new surfacing code.

---

## Next Step

**Test a multi-item submission against the live BC environment** to see the real HTTP 502 error body that the GCP API now surfaces.

Deploy the updated GCP API (the three changed Python files in `rgmc-gcp-api`) and submit an order with 2+ items. The frontend will now show an error toast/message rather than silently succeeding. The `detail` field of the 502 response will contain BC's actual rejection reason for the failing line (e.g., `"Line 2 creation failed: BC returned 400: {'error': {'code': 'Unknown', 'message': 'You cannot insert a Sales Line...'}}"`.

Once the BC error message is known, fix the underlying cause:
- If it's a **field mapping issue** (unknown field sent to BC): remove or rename the offending field in `_map_line_payload()` in `sales_order_routes.py` / `sales_return_order_routes.py`.
- If it's a **`lineNo` conflict** (BC auto-creates a blank line when header is created): add `"lineNo": i * 10000` to each `line_payload` dict in the loop, and expose `lineNo` as an optional field in the Pydantic models.
- If it's a **`postingDate` issue** in the header: check if Pydantic's `date` → JSON serialization (`"2026-06-10"`) matches what BC's custom page field expects, or whether `postingDate` should be excluded from the header payload entirely.

---

## Context & Gotchas

- **Frontend calls `/bc/sales-orders`** (standard `sales_order_router`), NOT `/bc/custom/sales-orders` (`rgmc_sales_order_router`). Verify this if BC behavior seems to differ from what the code expects.
- **Return orders use `/bc/custom/sales-return-orders`** (the `sales_return_order_router` in `sales_return_order_routes.py`).
- **`onBeforeRouteLeave` only saves if `currentSession.value.customer` is set** — sessions without a customer are not persisted to drafts. The `visibleDrafts` filter in LandingPage also enforces `d.customer !== null`, so this is consistent.
- **Ionic's `ion-router-outlet` keeps pages alive** — `onMounted` in ScanningPage only fires once, not on every navigation. The `onBeforeRouteLeave` guard fires on every route change away from the page.
- **`_saveDraft()` (private) vs `autoSaveDraft()` (public)**: `_saveDraft` is called internally on every mutation (addSalesOrder, setCustomer, etc.). `autoSaveDraft` is the new public variant for the route-leave guard — same logic, but without clearing `currentSession`.
- **GCP API rollback behavior**: If line creation fails AND the rollback delete also fails (e.g., network issue), the error is logged and the HTTPException is still raised. The frontend gets a 502 either way, but BC may be left with a partial order. This is an edge case.
- **`SalesOrderCreate.postingDate` is type `date` in Pydantic** (not `str`). `model_dump(mode='json')` serializes it as `"YYYY-MM-DD"`. `SalesReturnOrderCreate.postingDate` is already `str`. This inconsistency exists but hasn't caused a confirmed bug.
- **TypeScript version**: `npx vue-tsc --noEmit` must pass before any commit. It was clean at the end of this session.
- **Working directory**: Frontend is at `C:\claude\rgmc-consignment-webapp`. GCP API is at `C:\RGMC\Source\git\rgmc-gcp-api`. They are separate git repos.
