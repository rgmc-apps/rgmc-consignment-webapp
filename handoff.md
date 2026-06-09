# Handoff

## Goal
Build and maintain the RGMC Consignment Web App — an Ionic/Vue PWA used by sales agents to scan items and submit sales orders and return orders to Business Central via a FastAPI GCP backend. The app handles item scanning, customer selection, order review/submission, and session history.

Current focus: add a `submittedBy` field (Text[100] on Sales Header) that records the user's display name on every submitted sales order and return order. This required AL table/page extensions, a custom BC API page for sales orders (since standard v2.0 doesn't expose custom fields), and GCP API + frontend changes.

## Current State

### Frontend (`C:\claude\rgmc-consignment-webapp`) — ✅ CLEAN
- All changes committed and pushed to `origin/master`
- Latest commits: `1faba54` (routing changes — fixed `displayName` mapping for items) and `174596c` (added submittedBy)
- `submittedBy` is sent in both sales and return order payloads
- Item `displayName` bug fixed: `getItems()` now maps `description` → `displayName` since Pag50205 never exposes a `displayName` field

### GCP API (`C:\RGMC\Source\git\rgmc-gcp-api`) — ⚠️ CRITICAL: untracked file
- All tracked changes committed and pushed to `origin/main` (latest commit: `f77ecca` "added changes on salesorder")
- `sales_order_routes.py` updated to use `rgmc_*` functions (RGMC custom API instead of standard v2.0)
- `sales_order_models.py` has `submittedBy`; `sales_return_order_models.py` has `submittedBy`
- `__init__.py` already imports `RgmcSalesOrderCreate` from `rgmc_sales_order_models.py`
- **CRITICAL**: `src/models/bc_models/rgmc_sales_order_models.py` is **untracked** (not in git) but is imported by `__init__.py` — this WILL cause an `ImportError` when deployed to Cloud Run
- GCP API has NOT yet been redeployed to Cloud Run

### AL Project (`C:\RGMC\AL\RGMC_AL_v2`) — ✅ CLEAN (git), ❌ NOT deployed to BC
- All changes committed and pushed to `origin/main`
- New files added this session (all committed):
  - `source/RGMCSalesOrder/RGMCSalesHeaderTableExt.al` — tableextension 50211, adds `"Submitted By"` (Text[100]) to "Sales Header"
  - `source/RGMCSalesOrder/RGMCSalesOrderCardPageExt.al` — pageextension 50212 on "Sales Order" card
  - `source/RGMCSalesOrder/RGMCSalesOrderListPageExt.al` — pageextension 50213 on "Sales Order List"
  - `source/RGMCSalesOrder/50216RGMCSalesOrderAPI.al` — custom API page for Sales Orders, exposes `submittedBy`
  - `source/RGMCSalesOrder/50217RGMCSalesOrderLinesAPI.al` — custom API page for Sales Order Lines (sub-resource of Pag50216)
  - `source/RGMCSalesReturnOrder/RGMCSalesReturnOrderCardPageExt.al` — pageextension 50214 on "Sales Return Order" card
  - `source/RGMCSalesReturnOrder/RGMCSalesReturnOrderListPageExt.al` — pageextension 50215 (intentionally empty — see Gotchas)
  - `source/RGMCSalesReturnOrder/50201LSCRetailSalesReturnOrderAPI.al` — updated to expose `submittedBy` field
- AL extension has NOT been built/published to Business Central yet

## Files Actively Being Edited
All files are in a stable committed state. The only outstanding issue is one untracked file:

- `C:\RGMC\Source\git\rgmc-gcp-api\src\models\bc_models\rgmc_sales_order_models.py` — **untracked, not committed**. Contains `RgmcSalesOrderCreate`, `RgmcSalesOrderUpdate`, `RgmcSalesOrderLineCreate`, `RgmcSalesOrderLineUpdate` with native RGMC field names (e.g. `sellToCustomerNo`). Already imported by `__init__.py` in HEAD. Must be committed before Cloud Run deployment or the API will crash on startup.

## Failed Attempts
- **What was tried**: Adding `yourReference` to sales orders payload — **Why it failed**: BC standard v2.0 `salesOrders` API entity does not expose `"Your Reference"` field; BC returned 400 `"The property 'yourReference' does not exist on type 'Microsoft.NAV.salesOrder'"`
- **What was tried**: Exposing `submittedBy` via the standard BC v2.0 `salesOrders` endpoint — **Why it failed**: Standard v2.0 does not expose custom table extension fields. Solution was to create a new custom RGMC API page (Pag50216) and switch the GCP route to use `rgmc_*` functions.
- **What was tried**: Adding `"Submitted By"` to the Sales Return Orders list page extension (pageextension 50215) — **Why it failed**: `Control1` on the "Sales Return Orders" page sources `Sales Line`, not `Sales Header`; the field is a Sales Header field so it's inaccessible. Left the file as an intentionally empty extension with a comment. The field IS shown on the card via `RGMCSalesReturnOrderCardPageExt.al`.
- **What was tried**: `item.displayName` in toast/form from raw API data — **Why it failed**: Pag50205 maps item name to `description`, not `displayName`, so `displayName` was always `undefined` and rendered as "undefined added to Sales". Fixed by mapping `description → displayName` in `getItems()`.

## Next Step
**Commit the untracked `rgmc_sales_order_models.py` before deploying:**

```
cd C:\RGMC\Source\git\rgmc-gcp-api
git add src/models/bc_models/rgmc_sales_order_models.py
git commit -m "add RgmcSalesOrder models for custom API (Pag50216/50217)"
git push
```

Then deploy the GCP API to Cloud Run (project `durable-woods-465907-n1`, region `asia-southeast1`).

Then build and publish the AL extension to Business Central to create the `"Submitted By"` field and activate the new API pages (Pag50216, Pag50217).

## Context & Gotchas
- **`sales_order_routes.py` model choice**: The route imports `SalesOrderCreate` (old model with `customerNumber`) and applies field mapping (`customerNumber` → `sellToCustomerNo`). `RgmcSalesOrderCreate` (native field names) exists but is NOT used by the route — this is intentional, the route mapping approach preserves backward-compatible frontend field names.
- **AL ID range**: Project range is 50100–50299. IDs 50100–50217 are now used. Next available: 50218.
- **`"Submitted By"` field doesn't exist in BC yet** until the AL extension is deployed. Until then, any write with `submittedBy` will either be silently ignored or may error depending on BC behavior with unknown fields.
- **`yourReference` still in `SalesReturnOrderCreate` model**: The GCP API model still accepts `yourReference` (maps to BC's standard `"Your Reference"` field), but the frontend no longer sends it — the frontend now sends `submittedBy` instead. No conflict; just a vestigial model field.
- **Sales Return Orders list page is intentionally empty**: Pageextension 50215 (`RGMCSalesReturnOrderListPageExt.al`) has no layout fields because `Control1` on that page sources `Sales Line` rows, not `Sales Header`. Do not add `"Submitted By"` there; it will fail to compile.
- **GCP API not yet deployed**: All 4 commits since last deploy are pushed but Cloud Run still runs the old image. Must redeploy after committing `rgmc_sales_order_models.py`.
- **BC custom API endpoint for sales orders**: After AL deployment, the custom sales order API lives at `api/rgmc/rgmccustom/v1.0/companies({id})/salesOrders` (Pag50216). The GCP API route `sales_order_routes.py` already points there via `rgmc_create_record` / `call_rgmc_table`.
- **`displayName` on items**: Pag50205 only exposes `description` for the item name. `getItems()` in `api.service.ts` maps `description → displayName` as fallback so `item.displayName` is always populated.
