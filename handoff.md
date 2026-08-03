# Handoff

## Goal

Fix `GET /bc/custom/v3/item-prices` returning 503 "Item price catalog is empty" even when Firestore has RGMC records, and ensure future syncs populate Firestore with active (non-blocked) prices by finding the nearest valid BC price date rather than requiring an exact today match.

The broader goal is a stable RGMC Consignment Web App where the Ionic/Vue frontend can sync item prices from Firestore (populated by the worker pool from BC) without hitting BC directly.

## Current State

**All code changes are complete and committed. Nothing in either repo has been pushed since the last session — both have unpushed commits waiting.**

### rgmc-bc-api (`C:\claude\rgmc-bc-api`)
Unpushed commit:
- `b800770` — date fallback + false-503 fix (this session)

Already deployed (pushed in prior sessions):
- `b09b7bc` — `POST /internal/firestore/sync-item-prices-direct` endpoint
- `cfe7987` — `GET /internal/test/catalog-status` shows both env collections
- `96fcd01` — 503 detail includes company + collection name

### rgmc-worker-pool (`C:\claude\rgmc-worker-pool`)
Unpushed commit:
- `55dd08f` — date fallback in `fetch_v3_catalog` (this session)

Already deployed (pushed and confirmed in prior sessions):
- `248ff64` — incremental sync via `lastModifiedDateTime`

### rgmc-consignment-webapp (`C:\claude\rgmc-consignment-webapp`)
No unpushed commits. All webapp changes from prior sessions are deployed.

### Known Firestore State
Collection `item_prices_production` for company `RGMC` exists but **all records have `blocked: True`** — they were synced on a date outside BC's price-list valid date range. After deploying the new commits and re-syncing, the date fallback will automatically find a valid date and populate the collection with active records.

## Files Actively Being Edited

All edits are committed. No files are mid-change.

**rgmc-bc-api:**
- `src/services/bc_functions.py` — `rgmc_v3_fetch_catalog_direct`: now loops `start_date` back up to 30 days; returns all records for the first date where `any(not r.get("blocked") for r in records)` is True. Logs which date was chosen if different from requested.
- `src/routers/bc_routes/rgmc_item_price_v3_routes.py` — `list_item_prices`: replaced the old `catalog_empty` logic with an `include_blocked=True` guard; records-exist-but-all-blocked now returns `{"data":[], "total":0, "source":"firestore"}` with 200 OK instead of 503. Same change applied to `get_item_price_count`.
- `src/services/price_firestore_service.py` — line 103: `data.get("blocked")` → `data.get("blocked") is True` (strict boolean, prevents truthy strings like `"No"` from incorrectly filtering records).

**rgmc-worker-pool:**
- `src/services/bc_client.py` — extracted `_fetch_v3_catalog_for_date(company_id, company_name, effective_date, since=None)` helper; `fetch_v3_catalog` now loops up to 30 days on full syncs (`since=None`), skips fallback on incremental syncs (`since` set).

## Failed Attempts

- **What was tried**: Assumed GCP_ENV mismatch — worker writes to `item_prices_staging`, bc-api reads `item_prices_production` — **Why it failed**: User confirmed GCP_ENV=Production on both services; `catalog-status` endpoint showed records exist in `item_prices_production`.
- **What was tried**: Assumed catalog was completely empty — **Why it failed**: User confirmed RGMC records DO exist in Firestore; all had `blocked: True` because sync used `onDate eq today` and today is outside the price-list's valid range.
- **What was tried**: 503 detail improvement to expose company+collection — **Why it failed** (as a standalone fix): Made the error more debuggable but did not resolve the underlying issue. The 503 was still triggered on every read.

## Next Step

**Push both repos to trigger Cloud Build deploys:**

```powershell
cd C:\claude\rgmc-bc-api; git push origin master
cd C:\claude\rgmc-worker-pool; git push origin master
```

After both Cloud Build deploys complete (~3–5 min each), trigger a re-sync to populate Firestore with valid non-blocked records:

```
POST /internal/firestore/sync-item-prices-direct
  Header: X-Task-Secret: <TASK_SECRET>
  Query:  company=RGMC
```

This bypasses the worker pool entirely (useful to confirm the date fallback works immediately). Or use `POST /internal/firestore/routine-sync` for a full three-collection sync via the worker pool.

Then verify:
```
GET /bc/custom/v3/item-prices?company=RGMC          → should return data with total > 0
GET /internal/test/catalog-status?company=RGMC      → X-Task-Secret required; check this_env record counts
```

## Context & Gotchas

- **Three repos**: `C:\claude\rgmc-bc-api`, `C:\claude\rgmc-worker-pool`, `C:\claude\rgmc-consignment-webapp`. All on Cloud Run. Cloud Build auto-deploys on `git push origin master`.
- **GCP project**: `durable-woods-465907-n1`, region: `asia-southeast1`. GCP_ENV must be `"Production"` on both bc-api and worker pool Cloud Run services — controls Firestore collection suffix (`item_prices_production` vs `item_prices_staging`).
- **Repo locations**:
  - `C:\claude\rgmc-worker-pool` → GitHub: `erar404/rgmc-worker-pool`
  - `C:\claude\rgmc-bc-api` → GitHub: `rgmc-apps/rgmc-bc-api`
  - `C:\claude\rgmc-consignment-webapp` → GitHub: `rgmc-apps/rgmc-consignment-webapp`
- **`blocked` field from BC**: BC sets `blocked: True` (Python bool) when `onDate` is outside the price's valid date range. Strict `is True` check is intentional — `blocked: False` or `blocked: "No"` must not exclude records.
- **Date fallback rationale**: BC's `Pag50318` `onDate eq {date}` filter returns prices valid on that exact date. If today is past all price list end dates, BC returns items with `blocked: True`. The fix tries up to 30 days back to find the nearest date with at least one active price. This is the "nearest date on its range" the user requested.
- **Incremental sync and date fallback**: When `since` is set in `fetch_v3_catalog` (incremental run), the fallback is skipped — the worker only fetches records modified since last sync. The initial full sync (when `since=None`, i.e., `sync_state_{env}` has no entry) will use the date fallback to find a valid date. Subsequent incremental runs don't need date fallback because data is already in Firestore.
- **False 503 fix**: The list endpoint now uses `include_blocked=True` to check for any records. If records exist (even all blocked) → 200 empty. If collection is truly empty → 503. This prevents the false 503 while existing blocked data is in Firestore.
- **`POST /internal/firestore/sync-item-prices-direct`**: Bypasses worker pool — calls BC directly from bc-api. Fast for one-off syncs and diagnostics. Introduced in `b09b7bc`.
- **`GET /internal/test/catalog-status`**: Returns record counts for both `this_env` and `alt_env` Firestore collections per company. Use to confirm GCP_ENV alignment. Introduced in `cfe7987`.
- **nginx `proxy_read_timeout 200s`**: Already deployed in webapp (`ed7a97d`). Prevents 504 on large Firestore reads. Do not reduce.
- **Worker pool `max_messages=1`**: Prevents concurrent OOM from two simultaneous heavy BC catalog fetches. Configured in Pub/Sub subscription; don't change.
- **`sync_state_{env}` Firestore collection**: Tracks last-sync timestamps per `(company, collection_type)` for incremental sync. Populated by `set_sync_state()` in `sync_worker.py` after each successful write.
- **Cloud Build quirk**: PowerShell `<<'EOF'` heredoc syntax fails in this environment — use PowerShell `@'...'@` here-strings for multi-line git commit messages.
- **IAM**: Worker pool SA (`rgmc-worker-pool@...`) needs `roles/pubsub.subscriber`; bc-api SA needs `roles/pubsub.publisher`. These were set in prior sessions.
