# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, stability, and reliability — correct item prices, stable sync, responsive UI, and resilience against BC API limitations.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos are committed and pushed on `master`. Clean state — no pending changes.**

### What was done in this session (July 22, 2026):

**Removed startup warmups from `main.py`**
- `lifespan` is now a bare `yield` — no background threads, no preload, no hourly rewarm
- Kept all scheduler/task endpoints: `/internal/sync/trigger` → `bc-sync-queue` → `/internal/tasks/sync-catalog/{id}`
- Import list trimmed to only `ServiceWarmingError` from bc_functions

**Pag50318 / bc-api performance improvements**
- `_V3_PREFER_HEADER`: `odata.maxpagesize=1000` → `5000` — each range now fits in one OData response
- `_fetch_v3_catalog_parallel`: 2-range (A-M, M-Z) → **4-range** (A-G, G-M, M-S, S-Z) with `max_workers=4`
- AL `RGMCItemPriceAPIv3.Page.al` (committed `a016f17`):
  - Added `Status` to `SetLoadFields`
  - Added `PriceListLine.Status = "Price Status"::Active` check in loop — Draft/Inactive lines skipped in AL
  - **Additional AL changes pushed by user** (beyond what Claude wrote): `PriceListCodeFilter` fast-path via `PriceListHeader.SetRange("Item Family Code", FamilyFilter)` — when family has tagged price list headers, filters at the price-list-code level instead of a large product-no pipe-string; `RequestedPLFilter` reads `Rec.GetFilter("Price List Code")` for direct priceListCode filtering; `FamilyItemFilter` is now the fallback when no headers are tagged

**Firestore as primary source for item prices**
- `bc_functions._rgmc_v3_fetch_and_cache`: after GCS save, lazy-imports and calls `sync_prices_to_firestore` — every background cache refresh (Cloud Scheduler → Cloud Tasks → warmup) now also writes to Firestore automatically
- `rgmc_item_price_v3_routes.py`: Firestore-first on all GET endpoints:
  - `_try_firestore()` helper — returns records or `None` to signal fallback
  - `list_item_prices`: tries Firestore first (skipped only when `filter=` OData expression set); falls back to BC full-catalog fetch + Python-level slicing
  - `get_item_price_count`: tries Firestore first; falls back to Pag50319
  - `get_item_price/{id}`: always BC-only (Firestore keyed by `company_productNo`, not SystemId)
  - All responses include `"source": "firestore"` or `"source": "bc"`

**Fixed: 500 on large `bc_offset` → timeout**
- Root cause: `bc_offset=10942` was forwarded directly to BC; Pag50318's `OnOpenPage` must iterate all 10,942 items before returning anything → 120s read timeout
- Fix: `bc_limit`/`bc_offset` now treated as Python `skip`/`limit` throughout; `_bc_full_catalog()` fetches without bc params (hits in-memory cache → GCS → parallel BC fetch) then slices in Python — a large offset never hits BC directly
- Added `requests.exceptions.Timeout` catch → 504 Gateway Timeout (instead of 500) on both list and get-by-ID endpoints

**New Firestore service functions**
- `price_firestore_service.py`:
  - `get_prices_from_firestore()`: added `product_nos: list | None` and `price_list_code: str | None` params (both filtered in Python)
  - `sync_price_list_headers_to_firestore(records, company)`: upserts to `price_list_headers_{env}` collection; doc ID = `{company}_{code}`
  - `get_price_list_headers_from_firestore(company, status, item_family_code, price_type)`: reads from same collection, filters in Python

**New Firestore sync endpoints** (`rgmc_item_price_firestore_routes.py`)
- `POST /internal/firestore/sync-item-prices` — full catalog sync, BC → Firestore (X-Task-Secret required)
- `POST /internal/firestore/sync-price-list-headers` — price list headers from BC (Pag50320) → Firestore
- `POST /internal/firestore/routine-sync` — **fire-and-forget** background thread, syncs price list headers then item prices for all `BC_COMPANIES`; returns 202 immediately; avoids BC-native offset pagination
- `GET /bc/custom/v3/item-prices/catalog` — Firestore-only read (no BC fallback), intended for internal tooling

---

## Files Actively Being Edited

All committed and stable. No files are mid-change.

**Backend (`C:\claude\rgmc-bc-api\src`):**
- `main.py` — lifespan stripped to bare `yield`; imports trimmed to only `ServiceWarmingError`
- `services/bc_functions.py` — `_V3_PREFER_HEADER` → 5000; `_fetch_v3_catalog_parallel` → 4 ranges/workers; `_rgmc_v3_fetch_and_cache` → lazy Firestore sync after GCS save
- `services/price_firestore_service.py` — added `product_nos`, `price_list_code` params; added price_list_headers collection, `sync_price_list_headers_to_firestore`, `get_price_list_headers_from_firestore`
- `routers/bc_routes/rgmc_item_price_v3_routes.py` — Firestore-first, `_try_firestore()`, `_bc_full_catalog()`, bc_limit/bc_offset → Python slice, 504 on timeout
- `routers/bc_routes/rgmc_item_price_firestore_routes.py` — sync-item-prices, sync-price-list-headers, routine-sync, catalog endpoints
- `routers/bc_routes/task_routes.py` — docstring updated to mention Firestore

**AL (`C:\RGMC\AL\RGMC_ERAR_AL\source\RGMCItems`):**
- `RGMCItemPriceAPIv3.Page.al` — Status in SetLoadFields + Status=Active loop check; PriceListHeader fast-path for family filter; RequestedPLFilter for direct priceListCode filter

---

## Failed Attempts

- **PowerShell `$(cat <<'EOF')` heredoc for git commit messages** — parse error. Must use `@'...'@` here-string syntax.
- **`familyCode eq '{family_code}'` in OData URL to BC** — BC rejects OData filters on temp-buffer fields. `familyCode` in Pag50318 is computed in `OnOpenPage`, not a real table column. All familyCode filtering must be done in Python.
- **3 gunicorn workers** — each worker gets its own semaphore; `_bc_semaphore(4)` becomes effectively 12 concurrent connections, exceeding BC's ~5-connection limit. Stay at `workers=1`.
- **BC-native `bc_limit`/`bc_offset` pagination** — Pag50318's `OnOpenPage` must iterate ALL items up to `bc_offset` before returning anything. At offset 10,942 this caused a 120s read timeout (Error 500). Fixed: always Python-slice from Firestore/cache instead.
- **`maxpagesize=1000` with 2-range parallel fetch** — if a range had >1000 items, BC ran `OnOpenPage` multiple times sequentially (once per OData page), each full buffer rebuild adding 10-20s. Fixed: maxpagesize=5000 + 4 ranges so each range fits in one page.
- **Startup warmup threads** — removed. They were causing BC connection pressure on every cold start. Cloud Scheduler + bc-sync-queue is the correct mechanism.
- **`--max-retry-duration=5m`** for gcloud tasks queues create — invalid format. Must use seconds: `300s`, `3600s`.

---

## Next Step

**Populate Firestore for the first time.** Firestore collections (`item_prices_{env}`, `price_list_headers_{env}`) are empty until seeded. The main v3 endpoints will fall back to BC (in-memory cache / GCS) until Firestore is populated.

Call the routine-sync endpoint for each company:

```
POST https://<cloud-run-url>/internal/firestore/routine-sync
X-Task-Secret: <TASK_SECRET>
```

(No body needed — reads `BC_COMPANIES` env var.)

This fires a background thread that:
1. Fetches price list headers from BC → writes to `price_list_headers_{env}`
2. Fetches full item price catalog (from in-memory cache → GCS → live BC) → writes to `item_prices_{env}`

Verify with:
```
GET https://<cloud-run-url>/bc/custom/v3/item-prices/catalog?company=RGMC
```

Response should include `"total": N` where N > 0. After this, all GET /bc/custom/v3/item-prices calls will be served from Firestore.

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`. AL extension at `C:\RGMC\AL\RGMC_ERAR_AL`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that builds a temp buffer table — inherently slow cold. Firestore is now the primary cache layer to avoid any BC call on reads.
- `familyCode` in Pag50318 is a **computed temp-buffer field** — BC's OData engine rejects it as a `$filter` parameter. All familyCode filtering must be done in Python against the full catalog cache.
- `productNo ge/lt` range filters ARE supported by Pag50318's OnOpenPage (they scan at the SQL level before inserting into the temp buffer). This is what enables the 4-range parallel catalog fetch.

### Firestore data flow (steady state)
```
Cloud Scheduler (every 12h)
  → POST /internal/sync/trigger          (X-Task-Secret)
  → Cloud Tasks bc-sync-queue
  → POST /internal/tasks/sync-catalog/{id}
  → rgmc_v3_warmup(company)
  → _trigger_v3_refresh()
  → _rgmc_v3_fetch_and_cache()           ← 4 parallel BC ranges
      → in-memory cache
      → GCS (rgmc-bc-catalog bucket)
      → Firestore item_prices_{env}      ← NEW, lazy import, silently skipped on error
```

### Firestore read path for item prices
```
GET /bc/custom/v3/item-prices
  1. _try_firestore() → company-scoped Firestore query (~50ms)
     - skipped only when ?filter= OData expression is set
     - returns None on empty or exception → falls through
  2. _bc_full_catalog() → rgmc_v3_list_item_prices() (no bc params)
     → in-memory cache → GCS → live BC parallel fetch
     → Python-level slice applied after
  3. ServiceWarmingError (503) only if BC is truly unreachable AND cache/GCS cold
```

### bc_offset / bc_limit
`bc_limit` and `bc_offset` are now treated identically to `skip`/`limit` — they apply Python-level slicing on Firestore or cached data. They are NEVER forwarded to BC. The original BC-native behavior (`_rgmc_v3_build_url` with `bc_limit`/`bc_offset` params) still exists in `bc_functions.py` for the internal sync endpoint but should not be used from the frontend or via large offsets.

### Two Cloud Tasks queues
- `bc-order-queue`: sales/return order submission. `max-concurrent=5`, `max-attempts=3`, `max-retry-duration=300s`
- `bc-sync-queue`: v3 catalog sync/warmup. `max-concurrent=2`, `max-attempts=5`, `max-retry-duration=3600s`
- Both validate `X-Task-Secret` header against `TASK_SECRET` env var

### GCP setup still needed (user action required)
1. **Rename `CLOUD_TASKS_QUEUE` → `CLOUD_TASKS_ORDER_QUEUE`** in Cloud Run env vars
2. **Add `CLOUD_TASKS_SYNC_QUEUE=bc-sync-queue`** to Cloud Run env vars
3. **Add `BC_COMPANIES=RGMC,CGI`** to Cloud Run env vars (comma-separated)
4. **Layer 2A**: Cloud Run → `rgmc-bc-api` → Edit & Deploy → Max instances=1, Min instances=1, Concurrency=6
5. **Firestore permissions**: Cloud Run service account needs `Cloud Datastore User` (or `Firebase Admin`) role on the GCP project to read/write Firestore
6. **Cloud Scheduler** — create two jobs:
   - `bc-catalog-sync` → `POST /internal/sync/trigger` with body `{"companies":["RGMC","CGI"]}`, X-Task-Secret, every 12h
   - OR: `bc-routine-sync` → `POST /internal/firestore/routine-sync`, X-Task-Secret, every 12h (simpler — one call handles both price list headers and item prices)
7. **Verify GCS service account** has `Storage Object User` on `rgmc-bc-catalog` bucket

### Firestore collections
- `item_prices_{env}` — e.g. `item_prices_production`. Doc ID: `{company}_{productNo}`. Extra fields vs BC: `company`, `onDate`, `syncedAt`, `env`
- `price_list_headers_{env}` — e.g. `price_list_headers_production`. Doc ID: `{company}_{code}`. Extra fields: `company`, `syncedAt`, `env`
- `GCP_ENV` env var controls the suffix: "Production" → `_production`, "Staging" → `_staging`

### Pag50318 AL optimizations (as of `a016f17`)
- `SetLoadFields` includes `Status` — no extra SQL column fetch, free in-memory check
- Loop body: `PriceListLine.Status = "Price Status"::Active` filters Draft/Inactive lines at AL level — SQL plan (Product No., Starting Date) index unchanged
- Family filter fast path: queries `PriceListHeader.SetRange("Item Family Code", FamilyFilter)` to get price list codes; filters `PriceListLine.SetFilter("Price List Code", PriceListCodeFilter)` instead of large product-no pipe-string. Falls back to pipe-string if no headers are tagged.
- `RequestedPLFilter` reads `Rec.GetFilter("Price List Code")` — allows direct priceListCode filter from OData (e.g. `?filter=priceListCode eq 'RGMC-STD'`)

### BC connection limit
- BC enforces ~5 simultaneous connections per API user
- `_bc_semaphore = threading.Semaphore(3)` gates all BC HTTP calls
- Cloud Run must stay at `max-instances=1`. If it scales to 2 instances, the semaphore per-process means up to 6 concurrent BC connections → 429 errors

### BC date filter syntax
- OData dates are **unquoted**: `postingDate eq 2026-07-17`
- Quoted dates (`postingDate eq '2026-07-17'`) return 0 results

### GCP project / resource names
- Project: `durable-woods-465907-n1`
- GCS catalog bucket: `rgmc-bc-catalog`
- Cloud Tasks location: set via `CLOUD_TASKS_LOCATION` env var
- `GCP_ENV` env var controls GCS blob path prefix and Firestore collection suffix: e.g. `Production` → `item_prices_production`

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — Layer 2A–2D hardening guide (committed).
