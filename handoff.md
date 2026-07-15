# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy. The current work stream is improving the login sync experience (speed, progress visibility, error feedback) and fixing display bugs in the history screen.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**All changes from this session are complete. TypeScript is clean (`vue-tsc --noEmit` passes).**

### Root cause of slowness + "cancelled" status (now fixed):

1. **BC `OnOpenPage` (Pag50318) is a full-table scan** — it iterates ALL price list lines before any OData filter is applied. `familyCode` is populated *after* the scan in `InsertPriceLine()`, so `$filter=familyCode eq 'CODE'` previously did not reduce BC's work — it only filtered the buffer after building it.

2. **Warmup was caching the wrong key** — `rgmc_v3_warmup` used `on_date=None` but the frontend sends `on_date=2026-07-15`. These are different cache keys, so the warmup cache was never hit by any frontend request.

3. **TTL was 5 minutes** — after expiry, every cold request went to BC and risked the 60s Axios timeout.

4. **No full-catalog superset cache** — each `family_code` request hit BC separately, even when the full catalog was already cached.

### What was done this session:

**1. BC AL — `RGMCItemPriceAPIv3.Page.al` (Pag50318)**
- Added family pre-filter in `OnOpenPage`: reads `Rec.GetRangeMin("Family Code")` before the main loop
- If familyCode filter is set, queries `Item` table by `LSC Item Family Code` to build a pipe-delimited product number filter string
- Applies that filter as `PriceListLine.SetFilter("Product No.", FamilyItemFilter)` before `FindSet()`
- BC now only reads price lines for items in that family (SQL-level filter) instead of all price lines
- If familyCode is set but no items match → `exit` immediately (nothing to return)

**2. Backend — `bc_functions.py`**
- Added `import datetime`
- `_V3_CACHE_TTL`: 300 → 86400 (24 hours) — prices change rarely; `/refresh` endpoint handles manual invalidation
- `rgmc_v3_warmup`: now uses today's date (`datetime.date.today().isoformat()`) so the cached key matches what the frontend actually sends
- `rgmc_v3_list_item_prices`: added full-catalog fast path — when `family_code` is requested and the full-catalog cache for that date exists, filters in Python (O(n) in-memory, milliseconds) instead of calling BC

**3. Backend — `main.py`**
- Added `_hourly_rewarm` background thread (sleeps 1h, calls `rgmc_v3_warmup`) to handle midnight date rollover without a restart

---

## Request Flow After These Changes

**On backend startup:**
1. `rgmc_v3_warmup(BC_COMPANY)` starts background thread → fetches ALL prices for today from BC (may take 30-60s, but client never waits for this)
2. Once populated, `_item_price_v3_cache[(company, None, None, None, '2026-07-15', None)]` is warm

**On user login sync (frontend Phase 2):**
1. Frontend sends `GET /bc/custom/v3/item-prices?on_date=2026-07-15&family_code=BRAND&company=...`
2. Backend checks: `family_code` is set, no `product_nos` → look for full-catalog cache at `(company, None, None, None, '2026-07-15', None)`
3. Full catalog is warm → Python filters in memory → returns in ~1ms
4. Frontend gets response instantly, Item Prices sub-task shows ✓

**On cache miss (first startup, or after `rgmc_v3_invalidate_cache`):**
1. Full-catalog cache not populated yet → falls through to BC call
2. With AL fix: BC only scans that family's price lines (much faster than full scan)
3. Response cached for 24h

---

## Files Actively Being Edited

All files are in a clean, complete state.

### BC AL — `C:\RGMC\AL\RGMC_ERAR_AL\source\RGMCItems\`

- `RGMCItemPriceAPIv3.Page.al` — Added `FamilyFilter`, `FamilyItem`, `FamilyItemFilter` local vars. Pre-filter block reads `Rec.GetRangeMin("Family Code")`, queries Item table, builds pipe-delimited product number filter. Applied as `PriceListLine.SetFilter("Product No.", FamilyItemFilter)`. AL extension must be re-published to BC for this to take effect.

### Backend — `C:\claude\rgmc-bc-api\src\`

- `services/bc_functions.py` — Added `import datetime`. `_V3_CACHE_TTL = 86400`. `rgmc_v3_warmup` uses today's date. `rgmc_v3_list_item_prices` has full-catalog fast path (lines before existing `if cached:` block).

- `main.py` — Added `_hourly_rewarm` function + thread start inside `_warmup_caches`. Function loops forever: sleeps 3600s, calls `rgmc_v3_warmup(config.BC_COMPANY)`.

### Frontend — No changes needed
The frontend already sends `on_date=TODAY` and uses the `family_code` fast path in `useSync.ts`. The backend changes make those requests fast without any frontend modification.

---

## Failed Attempts / Gotchas

- **`familyCode` OData filter on temp table**: BC applies OData filters on temp-table API pages AFTER `OnOpenPage` builds the buffer, NOT before. So `$filter=familyCode eq 'CODE'` doesn't reduce the number of Price List Line records BC reads. The AL fix resolves this by pre-filtering at the `PriceListLine` level using `SetFilter("Product No.", ...)`.

- **`Rec.GetRangeMin("Family Code")` in OnOpenPage**: For API pages with `SourceTableTemporary = true`, BC passes OData `$filter` values to the record before calling `OnOpenPage`. This is the same pattern used for `onDate`. If this doesn't work on the deployed BC version, the fallback is to remove the AL familyCode pre-filter and rely entirely on the backend caching (which is the main speedup anyway).

- **Previous sessions' dead ends** (still relevant):
  - OData OR filter with hundreds of `productNo eq 'X' or ...` → HTTP 414 (URL too long)
  - Load ALL prices unfiltered → 60s Axios timeout / cancelled
  - 3 concurrent chunk requests → BC throttles with 429

---

## Next Steps

1. **Re-publish the AL extension to BC** — The AL change to Pag50318 must be deployed to take effect. Without it, the BC call is slower but the backend caching still prevents the "cancelled" issue.

2. **Verify the fix** — After restarting the backend, wait ~60s for warmup to complete, then log in. The Item Prices sub-task should show a checkmark almost instantly.

3. **Manual cache refresh** — If prices are updated in BC mid-day, hit `POST /bc/custom/v3/item-prices/refresh?company=...` to invalidate and re-warm.

---

## Context & Gotchas (Persistent)

- **`useSync` is a module-level singleton** — all refs live outside the `useSync()` function body, shared across all components.
- **Phase 1 failures abort sync** — `Promise.all` throws if customers/items/categories fails. Phase 2 failures (contacts, prices) show warning banner only.
- **Progress math**: Phase 1 = 3 calls × 15% = 45%. Phase 2 familyCode path = +55% in one shot.
- **BC environment**: Python FastAPI backend at `C:\claude\rgmc-bc-api`. Frontend at `C:\claude\rgmc-consignment-webapp`. GCP proxy sits between frontend and BC.
- **`_V3_CACHE_TTL = 86400`** — 24h. If prices change mid-day, use the `/refresh` POST endpoint to invalidate.
