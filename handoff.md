# Handoff

## Goal

Maintain and improve the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by sales reps to scan and submit sales/return orders against a Business Central (BC) backend via a Python FastAPI proxy (`rgmc-bc-api`). Ongoing work stream: feature completeness, data accuracy, and reliability — correct item prices, stable sync, responsive UI, clear loading feedback, and resilience against BC API rate limits.

All changes must remain backward-compatible with existing draft sessions stored in localStorage/IndexedDB.

---

## Current State

**Both repos are committed on `master`. All recent work is committed. `consignment-infra.md` in `rgmc-bc-api` is untracked and should be committed.**

### What was done this session:

**Task 7 — Removed high-network-activity alert from home page; moved to profile submenu**
`LandingPage.vue` previously had a server-status alert that interrupted the home page layout. It was removed. `ProfileMenu.vue` received the equivalent `pop-server-notice` component directly below the sync panel, using `isBusy`/`isWarmingUp` from `useServerStatus`. The notice transitions in/out with `server-notice-fade`.

Commit: `2b6e71d`

**Task 8 — Added loading animations to login and scan screen**

*LoginPage.vue:*
- Logo loading pulse (`logo-loading-pulse` keyframe) while `companiesLoading || brandsLoading`
- Gateway skeleton — full skeleton UI with shimmer bones replaces the dropdowns while companies load
- Staggered field entrance (`login-field--stagger-1` through `--stagger-5`)
- Progress strip at top of card while loading or syncing
- Error card shake (`login-card--shake`)
- Success card ring glow (`login-card--success`)
- Button loading breathe animation + success state (green)
- Cycling text on button label during login and sync
- Per-table sync subtask panel with progress bar (shown after successful login in offline mode)

*ScanningPage.vue:*
- Syncing skeleton (`scan-skeleton`) mirroring the real form layout with shimmer bones
- Animated sync status message below the skeleton with cycling text
- `fetchingPrice` spinner inline in the SRP row while price is loading
- Network notice banner (`net-notice`) for offline and slow connection states
- Header pulse (`gold-online-pulse`) when first coming online
- Form fields group animated entrance (`form-fields` transition)

Commit: `2870a8a`

**Task 9 — Minor bug fixes**
- `RemarksModal.vue` — char counter logic adjusted
- `useSync.ts` — 503 handling tweaks
- `api.service.ts` — retry/timeout tuning
- `auth.store.ts` — minor fix

Commit: `defada7`

**Task 10 — 503 error fix refinement**
`api.service.ts` retry logic for 503 responses refined — consistent backoff applied across `getItemsPage` and `getItemsForDate`.

Commit: `669f058`

**Task 11 — Loading data fixes**
- `ItemSelectorModal.vue` — fixed edge case where `onlineItems` didn't update correctly after cache-hit early return
- `ScanningPage.vue` — fixed `orderDateValue` watcher to not re-trigger fetch when date change is programmatic

Commit: `d9e2726`

**Task 12 — GCP infra improvement document**
Created `C:\claude\rgmc-bc-api\consignment-infra.md` — a 4-layer GCP hardening plan addressing BC 429 rate limits and 503 price-catalog failures:
- **Layer 2A**: Cloud Run `max-instances=1`, `min-instances=1`, `concurrency=6` — forces single-instance so the in-process `_bc_semaphore(4)` acts as a true global BC connection limit. Free config change.
- **Layer 2B**: Cloud Storage catalog backup — GCS bucket saves the full v3 catalog JSON so restarts/deploys warm from GCS instead of calling BC cold. Estimated ~$0.01/month.
- **Layer 2C**: Cloud Scheduler daily 6 AM pre-warm — hits `/bc/custom/v3/item-prices/refresh` before work day starts. Free tier covers it.
- **Layer 2D**: Cloud Tasks for order submissions (already covered in `gcp-implementation.md`).
- **Total cost**: ~$2–3/month.

File is **UNTRACKED** — needs to be committed.

**Task 13 — Fixed ServiceWarmingError: "Price catalog unavailable — please retry in a moment."**

Root cause was two bugs in `C:\claude\rgmc-bc-api\src\services\bc_functions.py`:

**Bug 1 — `_block_until_v3_catalog_ready` exited immediately on fetch failure**
The old polling loop broke out the moment `_any_full_catalog_warming()` returned False. When a background fetch failed, `_v3_refreshing.discard()` ran in `finally:`, making `_any_full_catalog_warming()` immediately False → loop exited with no cache → returned None → ServiceWarmingError. The function never waited the full timeout and never retried.

**Fix**: Restructured to sleep-first, check for data each tick, re-trigger warmup when fetch fails (if >8s remain), only return None after deadline expires. Also raised `_V3_WARMUP_WAIT_S` from 40 to 55.

**Bug 2 — `_fetch_v3_catalog_parallel` failed entirely if any single range failed**
Old: `if errors: raise errors[0]` — one failing range out of three discarded all partial results.
Fixed: `if errors and not all_records: raise errors[0]` — only raises if ALL ranges returned nothing. Partial results are accepted with a warning log.

Commit: `3d2f502` in `C:\claude\rgmc-bc-api`

---

## Files Actively Being Edited

All committed and stable. One untracked file pending commit.

**Backend (`C:\claude\rgmc-bc-api`):**
- `src/services/bc_functions.py` — `_V3_WARMUP_WAIT_S` raised 40→55; `_block_until_v3_catalog_ready` rewritten to retry-on-failure; `_fetch_v3_catalog_parallel` changed to partial-success semantics
- `consignment-infra.md` — **NEW, UNTRACKED** — GCP 4-layer hardening plan; needs `git add` and commit

**Frontend (`C:\claude\rgmc-consignment-webapp\src`):**
- `stores/auth.store.ts` — line 179: `.name` → `.code` in password login path
- `components/RemarksModal.vue` — maxlength 250→35, counter shows `/35`, warn class at ≥30
- `services/api.service.ts` — retry/backoff tuning for item price endpoints
- `composables/useSync.ts` — 503 non-fatal on first sync; improved user-facing error message
- `views/LoginPage.vue` — full animation suite: skeleton, progress strip, shake, success ring, cycling text, subtask panel
- `views/ScanningPage.vue` — skeleton loader, fetchingPrice spinner, network notice, cache-first watcher, programmatic date watcher fix
- `components/ItemSelectorModal.vue` — cache-hit early return with `onlineItems` fix
- `components/ProfileMenu.vue` — `pop-server-notice` added below sync panel
- `views/LandingPage.vue` — removed high-network-activity alert block

---

## Failed Attempts

- **`setApiCompany(selectedCompany.name)` on password login** → caused BC 400 `Internal_InvalidTableRelation`. Fixed by using `.code`.
- **Remarks maxlength=250** → caused BC 400 `Application_StringExceededLength` on submit (BC "External Document No." is 35 chars max). Fixed by changing maxlength to 35.
- **Immediate 503 return on cold start** → frontend had to retry many times with delays. Fixed by replacing 503 with wait-and-serve in backend.
- **`cachedPrices` declared inside `if (seedItems.length > 0)` block** → out-of-scope TypeScript error. Fixed by hoisting declaration.
- **OData OR filter with many product numbers** → HTTP 414 (URL too long); chunk approach used instead.
- **`familyCode` OData filter to BC** → BC rejects it with 400; BC applies OData filters after `OnOpenPage` builds the temp buffer. Backend always fetches full catalog and filters in Python.
- **`_block_until_v3_catalog_ready` old logic** → exited immediately when background fetch failed because `_v3_refreshing` set was cleared by `finally:` before the loop checked it. Fixed by restructuring to deadline-based polling with re-trigger.
- **`_fetch_v3_catalog_parallel` all-or-nothing failure** → any single range failure (BC 429 on one range) discarded all partial results, forcing the entire catalog to be unavailable. Fixed by accepting partial results.

---

## Next Step

**Immediate (backend):** Commit the untracked `consignment-infra.md`:
```powershell
cd C:\claude\rgmc-bc-api
git add consignment-infra.md
git commit -m "add GCP infra hardening plan for BC rate limit resilience"
```

**Then (GCP console — most impactful, free, no code):** Implement Layer 2A from `consignment-infra.md`:
1. Go to Cloud Run → select the `rgmc-bc-api` service → Edit & Deploy New Revision
2. Under "Capacity": set Max instances = 1, Min instances = 1, Concurrency = 6
3. Deploy

This makes the in-process `_bc_semaphore(4)` a true global BC connection limiter since there will only ever be one instance. This alone should eliminate most BC 429 errors.

**Then (Layer 2B — GCS catalog backup):** Create `gcs_catalog.py` and integrate it into `_rgmc_v3_fetch_and_cache` to persist the catalog to GCS so restarts don't hit BC cold.

---

## Context & Gotchas

### Architecture
- Two repos: frontend at `C:\claude\rgmc-consignment-webapp`, backend at `C:\claude\rgmc-bc-api`.
- BC v3 item prices (`Pag50318`) uses an `OnOpenPage` trigger that scans all `Price List Line` records into a temp buffer — inherently slow (was 60-120s cold, now 6-20s with optimizations). Backend in-memory caching is the primary mitigation.
- `familyCode` is a temp-buffer field on `Pag50318` and **cannot be sent as an OData filter to BC** — BC rejects it with 400. The backend always fetches the full catalog and filters in Python.

### BC connection limit
- BC enforces a hard limit of ~5 simultaneous connections per API user.
- `_bc_semaphore = threading.Semaphore(4)` is **per-process**. If Cloud Run auto-scales to 2 instances, BC sees up to 8 concurrent connections → 429 errors.
- **Fix**: `max-instances=1` in Cloud Run makes the semaphore a true global limiter. Documented in `consignment-infra.md` Layer 2A.

### `_block_until_v3_catalog_ready` behavior (post-fix)
- Polls every 300ms, timeout 55s (under nginx 60s proxy_read_timeout)
- Triggers refresh immediately on entry
- If fetch fails (clears `_v3_refreshing`), re-triggers as long as >8s remain
- Only returns None if deadline expires with no data in cache
- If `None` returned → `ServiceWarmingError` raised → 503 (last resort)

### `_fetch_v3_catalog_parallel` behavior (post-fix)
- Fetches 3 ranges: `(None,'H')`, `('H','Q')`, `('Q',None)` in parallel
- If 1 or 2 ranges fail but at least some records returned: logs warning, returns partial set
- Only raises if ALL ranges failed and zero records returned

### v3 BC fetch optimization details
- `_V3_SELECT_FIELDS` = 11 fields (down from 22)
- `Prefer: odata.maxpagesize=500` — BC returns up to 500 per page vs default 100
- 3 ranges: `< 'H'`, `'H' ≤ x < 'Q'`, `>= 'Q'`
- Semaphore is 4 slots; 3 ranges consume 3 during warmup, leaving 1 for user traffic

### `getCachedItemPrices()` is single-date
Returns `{ date: string; prices: Record<string, number> } | null`. Only one date's prices in localStorage at a time. Cache-first checks `cached.date === onDate`.

### `useSync` is a module-level singleton
All refs (`isSyncing`, `syncProgress`, etc.) live outside the `useSync()` function body and are shared across all components.

### BC "External Document No." field
35 characters max — base table limit. `RemarksModal.vue` enforces this with `maxlength="35"`.

### Backend warmup order (main.py)
Startup sequence: `warmup_company_id` → `rgmc_v3_warmup` → `warmup_bc_lists` → `warmup_rgmc_lists` → `warmup_rgmc_v2_lists` → `warmup_dimension_lists` → `rgmc_v2_warmup_company_settings`.

### `_V3_CACHE_TTL = 86400` (24 hours)
If prices change mid-day, use `POST /bc/custom/v3/item-prices/refresh?company=...` to invalidate and re-warm.

### Hourly rewarm thread (main.py)
`_hourly_rewarm()` runs in a daemon thread and calls `rgmc_v3_warmup(config.BC_COMPANY)` every 3600s to keep the date-keyed cache current across midnight without a restart.

### AL source
`C:\RGMC\AL\RGMC_ERAR_AL\source\RGMCItems\RGMCItemPriceAPIv3.Page.al` — Pag50318. The `itemId` field on this page is the Item table's `SystemId`.

### Animation CSS variables added (variables.css)
`--ease-out-expo`, `--ease-out-quart` vars and `fade-slide-up`, `skel-shimmer` keyframes are in the global stylesheet. Both LoginPage.vue and ScanningPage.vue rely on these.

### GCP infra document
`C:\claude\rgmc-bc-api\consignment-infra.md` — full Layer 2A–2D implementation guide. Layer 2A (Cloud Run single-instance constraint) is the highest-priority free win. Layer 2B (GCS backup) requires new code. Layer 2C (Cloud Scheduler) is a GCP console-only step.
