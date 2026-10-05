# Handoff

## Goal

This session picked up from a prior handoff (deployment fixes + search bar — already done and verified) and then handled three new, unrelated requests from the user in `rgmc-consignment-webapp` and its backend sibling repo `rgmc-bc-api` (both under `C:\claude\`):

1. Confirm the BC "Chain" field (gating the customer dropdown, commit `231d387`) is live — **user confirmed it is**, no action needed.
2. Investigate why other users still report slow connections, and add a **Network Test** feature to the profile submenu so users can see actual latency/server-status results on their own device.
3. Fix the contacts endpoint used by the **login screen** so newly created Business Central contacts (new employees) are reflected immediately instead of waiting out a server-side cache.

All three are done. Both repos are committed, pushed, and confirmed deployed to production (verified via `gcloud builds list` and current Cloud Run revisions — see "Current State"). **One follow-up recommendation from part 2 (setting `min-instances` on `rgmc-bc-api-prod` to eliminate Cloud Run cold starts) was proposed to the user but never answered/applied — this is the one open thread.**

## Current State

**Nothing is broken or mid-edit. Both repos are clean (`git status` shows "nothing to commit, working tree clean" in both) and pushed to `origin/master`.**

### Part 2 — Slow-connection investigation + Network Test feature (DONE, deployed)
- **Root cause found for "other users still slow"**: `rgmc-bc-api-prod` (the real prod backend, per `[[project-infra-findings]]`) has **no `min-instances` set** (`autoscaling.knative.dev/minScale` annotation absent — confirmed via `gcloud run services describe`), so it scales to zero and cold-starts on the next request. Confirmed via Cloud Run system logs: **~65 "Starting new instance... AUTOSCALING" events in the last 3 days** (~1/hour), plus **121 HTTP 503s in 3 days**. The OOM "memory limit exceeded" events from the prior session's audit are NOT the current cause — all 6 of those are clustered on 2026-09-18 05:48–06:13 only, none since.
- **This root cause was NOT fixed** — only diagnosed. The recommended fix (`min-instances=1` or `2` on `rgmc-bc-api-prod`) was proposed to the user as a prod infra/cost change requiring confirmation, and the conversation moved on to other work before they answered. **See "Next Step."**
- **Network Test feature — built, verified, committed, deployed:**
  - New `src/composables/useNetworkTest.ts` — pings the existing `/bc/status` endpoint (via `ApiService.getApiStatus`) 4x, times each round-trip client-side, captures `navigator.connection` info (effectiveType/downlink/rtt/saveData) when available.
  - New `src/components/NetworkTestModal.vue` — shows first-ping vs. steady-state latency (the gap is what reveals a cold start vs. a genuinely slow connection), server state (warming_up/busy/active requests), device network info, and a plain-language verdict. Has a "Report These Results" button that feeds the raw numbers into the existing `useErrorReporter` bug-report flow.
  - `src/components/ProfileMenu.vue` — added a "Network Test" row between "Edit Profile" and "Sync", opens the new modal.
  - Verified live via headless Playwright against real staging BC API (same pattern as the prior session's search-bar test): pings came back 131–266ms, verdict correctly showed "Looks healthy."
  - `npx vue-tsc --noEmit` clean.
  - **Committed and pushed by the user as `92b9a62 added network tests`** (webapp repo). Cloud Build `97215bb3` (2026-09-21T05:24:22Z) succeeded — this build's timestamp matches the commit, confirming it deployed to `rgmc-consignment-prod` (current revision `rgmc-consignment-prod-00149-769`, 100% traffic).

### Part 3 — Contacts endpoint fix (DONE, deployed)
- **Root cause**: `/bc/custom/v2/contacts` (hit by the login screen via `ApiService.getContacts()`) does reach BC, but through `call_rgmc_v2_table()` in `rgmc-bc-api/src/services/bc_functions.py` (line ~1640), which serves unfiltered list calls from an **in-process 30-minute TTL cache** (docstring previously said "5-minute", actual constant `_LIST_CACHE_TTL = 1800`). Even when stale it does stale-while-revalidate (returns old data immediately, refreshes in background). Since `rgmc-bc-api-prod` can run up to 20 Cloud Run instances each with their own independent in-memory cache, a newly created BC contact (new employee) could appear on some instances and not others for up to 30 minutes — and the frontend's existing "candidate not found → retry" fallback in `auth.store.ts` didn't actually help, because the retry hits the same cached backend endpoint.
- **Fix**: `call_rgmc_v2_table()` gained a `bypass_cache: bool = False` parameter — when set, it fetches BC live first and only falls back to the cached entry if the live call itself fails (BC down/slow). `list_rgmc_contacts_v2()` in `rgmc_contact_v2_routes.py` now passes `bypass_cache=True`. No other v2 tables (customers, items, etc.) were touched — they keep cache-first behavior. Startup warmup (`warmup_rgmc_v2_lists`) still populates the contacts cache entry as before, so it remains available as the outage fallback.
- Compile-checked clean (`python -m py_compile` on both edited files).
- **Committed and pushed by the user as `f4f345a added bc endpoints`** (bc-api repo: `src/routers/bc_routes/rgmc_contact_v2_routes.py`, `src/services/bc_functions.py`). Cloud Build `eb2b915e...` (2026-09-21T10:12:30Z) succeeded — matches the commit timestamp (18:12:18 +0800 = 10:12:18 UTC), confirming deploy to `rgmc-bc-api-prod` (current revision `rgmc-bc-api-prod-00203-4kd`).

### Part 1 — Chain field
- User confirmed BC's "Chain" field is now live. The `231d387` filter (only chain customers in the dropdown) should now be working correctly in prod — not independently re-verified in-app this session, but no further action was requested.

## Files Actively Being Edited

None — everything is committed, pushed, and confirmed deployed. For reference, this session's changes:

**`rgmc-consignment-webapp`** (commit `92b9a62`):
- `src/composables/useNetworkTest.ts` — new file, network test composable.
- `src/components/NetworkTestModal.vue` — new file, network test UI.
- `src/components/ProfileMenu.vue` — added "Network Test" menu item + wiring.

**`rgmc-bc-api`** (commit `f4f345a`):
- `src/services/bc_functions.py` — added `bypass_cache` param to `call_rgmc_v2_table()`.
- `src/routers/bc_routes/rgmc_contact_v2_routes.py` — `list_rgmc_contacts_v2()` now calls with `bypass_cache=True`.

## Failed Attempts

None this session — both investigations (slow connections, contacts staleness) led directly to root causes on the first pass, and both fixes worked cleanly (type-check / compile-check passed first try, network test verified working in-browser on first Playwright run after fixing the profile-trigger selector — see below).

- **What was tried**: Playwright `page.click('.profile-trigger')` to open the profile popover. — **Why it failed**: Locator resolved to 2 elements (one not visible), `page.click` timed out waiting for the first one to become visible/stable. **Fix**: used `page.locator('.profile-trigger:visible').first()` with an explicit `waitFor({ state: 'visible' })` instead — worked immediately.

## Next Step

**Resolved (2026-09-22): user decided "Not now" on the `min-instances` fix for `rgmc-bc-api-prod`.** Re-verified before asking that `minScale` was still unset (only `maxScale: 20` present in the service's autoscaling annotations) — so cold starts are still occurring in prod, and the user has explicitly chosen to leave scale-to-zero as-is rather than pay for an always-on instance. **Do not re-propose this unprompted** — if the user raises slow-connection reports again, revisit, but treat this as a settled decision, not an open thread.

No other outstanding action items — parts 1–3 are fully done and deployed. Nothing left to resume from this handoff; it can be considered closed.

## Context & Gotchas

- **gcloud must be run from PowerShell**, not Bash, on this machine (`Python was not found` error in Bash's gcloud shim). Python for local checks/compiles: `C:\Users\erarellano\AppData\Local\Programs\Python\Python312\python.exe`.
- **`rgmc-consignment-prod` is the real production Cloud Run service** for the webapp; `rgmc-consignment-webapp` is a stale, different service — don't confuse them (see `[[project-infra-findings]]` memory).
- **The user commits and pushes independently** — this session made all code edits and left them uncommitted with a proposal, and the user committed + pushed both repos themselves shortly after (visible only via `git log`, not in the conversation). When resuming, always check `git status`/`git log` first rather than assuming edits are still pending, since the user may act on proposed changes outside the visible conversation.
- **`call_rgmc_v2_table()` is a shared generic helper** (`rgmc-bc-api/src/services/bc_functions.py`) used by contacts, customers, retail customers, sales orders, item families, items, warehouse activity, etc. — the `bypass_cache` fix was scoped narrowly to the contacts route only; do not assume other tables need or want the same treatment without checking each one's staleness tolerance first (the code comments there — "customers/contacts/categories change rarely" — reflect the *old* assumption this session partially overturned for contacts specifically).
- **Dev server port is 8100** (`vite.config.ts`), proxies `/bc`, `/internal`, `/tasks` to `VITE_API_BASE_URL` (`.env` → `rgmc-bc-api-staging`).
- **Playwright browser-testing pattern** (used again successfully this session): seed `localStorage` (`rgmc_auth`, `rgmc_company`, `rgmc_welcome_seen='1'`) via `context.addInitScript`, navigate to `/` first (not a deep route — auth hydrates after first navigation resolves), click "START NEW SESSION", then interact. Run via `NODE_PATH="$(pwd)/node_modules" node <script>` from inside `rgmc-consignment-webapp` (Playwright resolves `node_modules` relative to the script's own location, not cwd, and the script lives in the session scratchpad dir).
- **Cloud Run cold-start diagnostic commands used this session** (useful to re-run for a before/after comparison once `min-instances` is decided):
  ```
  gcloud run services describe rgmc-bc-api-prod --region=asia-southeast1 --project=durable-woods-465907-n1 --format="yaml(spec.template.metadata.annotations)"
  gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="rgmc-bc-api-prod" AND logName="projects/durable-woods-465907-n1/logs/run.googleapis.com%2Fvarlog%2Fsystem"' --project=durable-woods-465907-n1 --freshness=3d --format="value(timestamp, textPayload)"
  ```
- **`rgmc-bc-api-prod` sizing as of this session**: 2 vCPU / 4 GiB, concurrency 40, max-scale 20, `startup-cpu-boost: true`, min-scale unset (0). Unchanged from the prior session's audit — the OOM issue from that audit appears resolved (no memory-limit-exceeded events since 2026-09-18 06:13), but cold starts were never addressed and are the current live issue.
