# Handoff

## Goal

This session covered several linked requests across all three RGMC repos (`rgmc-consignment-webapp`, `rgmc-bc-api`, `rgmc-worker-pool`, all under `C:\claude\`), roughly in this order:

1. **Performance audit + fix** of `bc-api` and `rgmc-worker-pool` for loading big data faster, targeting a team of 30–50 concurrent users. Root cause of the original slowness (found in an earlier session, re-verified this session): the API was downloading/parsing a 27–151 MB price-list JSON blob per company on cold start and per-request; the worker pool's `GCS_CATALOG_BUCKET` env var pointed at a bucket that doesn't exist, so nothing it published ever reached the API. Rebuilt the pipeline so the worker pre-computes per-family, price-overlay-applied catalog blobs the API can serve nearly as-is.
2. **Automatic app versioning** — first built as a GitHub Actions workflow that committed a version bump on every push (rejected by the user: caused double Cloud Build deploys), then **switched to build-time git-based versioning** (current `__APP_BUILD__` = short git SHA + timestamp, computed inside the Docker builder stage; `__APP_VERSION__` stays a manually-bumped semver in `src/version.ts`).
3. **Root-cause fix**: submitted orders not appearing in History. Root cause: `SubmitPage.vue` kept submission progress (`salesStatus`, polling state, series numbers) in component-local refs; leaving the page (back button, hardware back — Vue Router intercepts both) before the ~5-minute BC poll resolved orphaned the result — the order succeeded in BC but was never written to local storage or Firestore.
4. **Follow-up**: also show pending (in-flight) submissions on the History page, live-updating to Submitted/Failed the instant they resolve — required moving submission state out of `SubmitPage.vue` into a module-level singleton composable (`useOrderSubmission.ts`) so it survives navigation and is observable from any page.
5. **Bug fix**: "Fetch BC Order Number" always showed "No matching BC order found" even when the endpoint genuinely returned matching data. Root cause, confirmed against the live API and production Firestore: BC's sales-order/return-order custom API returns the document number as `"number"`, not `"no"`. The app was reading `.no` everywhere (both the manual fetch AND the automatic capture at submission time), so **every submitted session in production had an empty series number** — confirmed 0 of the last 1000 sampled "submitted" Firestore records had one. Fixed all six occurrences across webapp/bc-api/worker-pool.
6. **Latest**: sort the History list so the currently logged-in brand's sessions appear first as a group (other brands still shown, just further down), per explicit user choice between "filter out other brands" vs "reorder, keep everything visible" (chose the latter).

End state desired: all of the above working correctly in the deployed apps, not just in the source tree.

## Current State

**All code changes are committed.** `git status` is clean in all three repos as of session end. Nothing is mid-edit.

**Deployment status — verified live via `gcloud` just before writing this handoff, NOT assumed:**

| Service | Live revision | Deployed at | Matches current HEAD? |
|---|---|---|---|
| `rgmc-consignment-webapp` (Cloud Run) | `rgmc-consignment-webapp-00106-lvc` | 2026-09-08 | **NO** — commit `5f4d1b0...`, predates *everything* from today (versioning, history fixes, order-number fix, brand sort — 4 commits, `dd49c80`..`10efcc9`). None of today's webapp work is live. |
| `rgmc-bc-api-prod` (Cloud Run) | `rgmc-bc-api-prod-00200-zn6` | 2026-09-16T09:06 | **YES** — commit `d89fd6f`, matches current HEAD exactly. Up to date. |
| `rgmc-worker-pool` (Cloud Run Worker Pool) | `rgmc-worker-pool-00056-t8k` | 2026-09-16T10:59 | **NO** — predates commit `ce1e213` (12:06, my performance rewrite: `gcs_catalog.py` streaming, `price_overlay.py`, `sync_worker.py`) and everything after it. |

**CRITICAL, still-unfixed blocker carried over from the performance work:** the live `rgmc-worker-pool` service's `GCS_CATALOG_BUCKET` env var is still `rgmc-bc-catalog-durable-woods-465907-n1` — **this bucket does not exist**. The correct value (confirmed: this is what `bc-api` actually reads from) is `rgmc-bc-catalog`. This was identified and documented as step 1 of the deployment plan in an earlier session and **was never applied**. Until this is fixed, none of the performance rewrite has any effect once deployed — the worker will 404 on every GCS write, same as before.

**`rgmc-worker-pool` has a large amount of unrelated work committed after my performance rewrite** (commits `31d9018` through `75621fe`, ~18:00–18:51, titles like "bulk SO creation", "POUL SO" company resolution, item-reference page fixes, Firestore retry buffering for failed POUL SO orders). I did not write these and have not reviewed them. Commit messages suggest they touch different files (item references, POUL SO/order-import flow) than my catalog/pricing work, so a conflict seems unlikely, but this is **not verified** — read `git log -p` on those commits before deploying worker-pool if anything looks off.

## Files Actively Being Edited

Nothing is currently mid-edit — all listed below is committed. Kept here for reference on what changed and why.

**`rgmc-consignment-webapp`** (HEAD `10efcc9`, 4 commits ahead of what's actually deployed):
- `src/composables/useOrderSubmission.ts` — **new file**. Module-level singleton (same pattern as `useSync.ts`/`useServerStatus.ts`) holding submission progress (`pendingSession`, `salesStatus`/`returnsStatus`, series numbers, errors) and the actual `submitSales`/`submitReturns`/`pollUntilDone` logic, moved out of `SubmitPage.vue`. A module-scope `watch` auto-finalizes (writes to storage + Firestore) the instant every order type the session has lines for reaches a terminal state, independent of which page is mounted.
- `src/views/SubmitPage.vue` — now a thin consumer of the composable. `onBeforeRouteLeave` changed from *blocking* navigation during submission to *detach-and-continue*: clears `currentSession` (only if it still points at the in-flight session) so Scan can start fresh, and lets the submission keep resolving in the shared composable state. Toasts moved to `watch()` on the shared refs.
- `src/views/HistoryPage.vue` — added a live "pending submission" card (spinner per order type, scoped to the logged-in user via `StorageService.getAuth()` so a shared device never shows one rep's in-flight order under another's session), non-interactive (no click-through — see Failed Attempts). Fixed `matchOrder()`/`fetchOrderNumber()` reading `.no` → `.number`. Fixed BC Orders panel list rows and detail modal reading `.no` → `.number`. Changed `mergedSessions` sort to a two-key sort: current-brand-first, then newest-first within each group.
- `src/stores/session.store.ts` — `markSubmitted`/`markFailed` now accept an optional explicit `target?: ScanSession` param (defaults to `currentSession`, preserving exact original behavior for existing no-arg call sites) so the composable can finalize a session `currentSession` no longer points at, without touching a different/newer session the user may have since started. Asymmetry preserved deliberately: `markFailed` with no target still does NOT clear `currentSession` (original behavior); `markSubmitted` with no target always does.
- `src/main.ts` / build config for versioning:
  - `vite.config.ts` — `__APP_VERSION__` now sourced from `src/version.ts` (single source of truth) instead of `package.json`. `getBuildId()` runs `git rev-parse --short HEAD` at build time (try/catch, falls back to timestamp-only if git/`.git` unavailable) for `__APP_BUILD__`.
  - `Dockerfile` — added `RUN apk add --no-cache git` in the builder stage.
  - `.dockerignore` — removed the `.git` exclusion (only affects the discarded builder stage, not the final `nginx` image).
  - `package.json` / `package-lock.json` / `src/version.ts` — reconciled to `1.2.0` (were previously out of sync: `1.0.0` vs `1.2.0`).
- No GitHub Actions workflow exists for versioning — the earlier `auto-version.yml` attempt was deleted; this repo's `.github/workflows/` only has the pre-existing `dev-item-comment.yml` (unrelated, DI-ticket commit-comment bot).

**`rgmc-bc-api`** (HEAD `d89fd6f`, **deployed and live**):
- `src/services/gcs_catalog.py` — rewritten: generation-aware in-process cache (re-downloads a blob only when its GCS generation changes, not on a fixed TTL), lazy JSON parsing, serves family blobs' raw gzip bytes as-is when possible (skips parse+re-encode+re-compress for the common request shape).
- `src/routers/bc_routes/rgmc_item_price_v3_routes.py` — family-blob fast path, search-index-based product lookups (avoids loading the full catalog for barcode/substring search), historical-date price overlay via a compact index.
- `src/routers/bc_routes/rgmc_item_price_firestore_routes.py` — added a 60s in-process cache for `POST .../sync` (single-item live BC price check), since every item add in the app calls this.
- `src/services/price_firestore_service.py` — `get_price_overrides_from_price_list_items` now reads the worker's compact `price_overrides.json` index instead of loading all price-list-items into memory.
- `src/main.py` — `default_response_class=ORJSONResponse` (faster serialization for multi-MB payloads); replaced the `BaseHTTPMiddleware`-based error-email middleware (which re-streamed every response body) with a pure-ASGI version that only buffers 500/502 bodies; removed a dead `X-Process-Time` middleware.
- `src/services/bc_functions.py` — no longer writes GCS/Firestore itself on a live BC fetch (that's the worker pool's job now via `sync-item-prices`); `/refresh` and `/internal/tasks/sync-catalog/{id}` now publish a Pub/Sub message to the worker instead of doing a synchronous full-catalog BC fetch in-process.
- `src/routers/bc_routes/task_routes.py` — `sync_catalog` endpoint now publishes to the worker pool instead of fetching directly; fixed a log message reading `data.get('no')` → `data.get('number')`.
- `requirements.txt` — added `orjson>=3.10,<4`.

**`rgmc-worker-pool`** (HEAD `75621fe`, **NOT deployed** — deployed revision predates commit `ce1e213`):
- `src/services/gcs_catalog.py` — rewritten to publish per-family catalog blobs (`families/{FAMILY}.json`, in the exact shape the API's list endpoint returns), a family index, a compact search index, and a compact price-overrides index — instead of one giant `catalog.json`. Streaming gzip write for the full catalog.
- `src/services/price_overlay.py` — **new file**. Shared price-list-overlay math (which price list is active on a date, which line wins) — used by both the GCS-blob-baking path and the existing Firestore best-price backfill, kept as two clearly-named accumulator classes so the two call sites can't silently diverge.
- `src/services/price_firestore_service.py` — Firestore batch writer now streams commits with a bounded number in flight (`_BatchWriter`) instead of building every batch up front.
- `src/services/bc_client.py` — price list lines now fetched one header (`$filter=code eq '...'`) at a time instead of one `$expand` call returning the whole company's price list items (previously up to 151 MB for RGMC).
- `src/workers/sync_worker.py` — rewritten to bake the price-list overlay into the GCS family blobs during sync, stamp `priceChangedAt` on records whose overlaid price changed (BC doesn't bump `lastModifiedDateTime` for price-list-only changes, so the app's delta sync was missing these).
- `src/workers/order_worker.py` — fixed a log message reading `resp_data.get('no')` → `resp_data.get('number')`.
- **Live env var still wrong**: `GCS_CATALOG_BUCKET=rgmc-bc-catalog-durable-woods-465907-n1` (nonexistent) — must be `rgmc-bc-catalog`. Not a code change — a `gcloud run` / Cloud Run console env var update on the live service.

## Failed Attempts

- **What was tried**: A GitHub Actions workflow (`auto-version.yml`) that bumped `package.json`/`src/version.ts` and committed back on every push to `master`. — **Why it failed**: Not a bug, a rejected design — the user pointed out this causes a second Cloud Build deploy for every commit (the bump-commit itself triggers another build). Deleted; replaced with build-time git SHA versioning (no repo commits at all).
- **What was tried**: Blocking navigation away from `SubmitPage.vue` entirely while a submission was in flight (`onBeforeRouteLeave` returning `false` with a "please wait" toast) as the fix for orders not reaching History. — **Why it failed**: Worked for that narrow bug, but the user's follow-up ask (show pending submissions on History, live-updating) is impossible if the page can't be left — reworked into the non-blocking "detach and continue in the shared composable" design instead.
- **What was tried**: `useOrderSubmission.ts`'s `onBeforeRouteLeave` guard, first draft, unconditionally called `finalizeOutcome()`/`finalize()` whenever leaving with nothing in the `'submitting'` state. — **Why it failed**: For a session where NOTHING had been submitted yet (both statuses still `'pending'`), `anyFailed` is `false`, so this would call `markSubmitted()` and silently convert an untouched draft into a fake "submitted" history record, deleting it from Drafts. Caught by manually tracing all exit-path combinations before shipping; fixed with an explicit `if (!anyDone.value && !anyFailed.value) return true;` early-out.
- **What was tried**: Making the new "pending submission" card on `HistoryPage.vue` clickable, navigating to `/app/submit` to "check on it". — **Why it failed**: Once `onBeforeRouteLeave` detaches `currentSession` on leaving mid-submission, `/app/submit` has nothing to show (`session.value` is `null`) — tapping the card would land on the generic "No active session" empty state, a dead end. Removed the click-through/chevron; the card already shows full live status in place.
- **What was tried**: A full end-to-end `npm run build` test in a copied+symlinked temp directory (`nogit-test`) with `.git` stripped, to verify the git-versioning fallback under a real build. — **Why it failed**: Not a real bug — the `cp -r .../* nogit-test/` copy silently dropped `index.html` (glob/timing issue with the ad-hoc test rig, background-task race), so Vite failed with "Could not resolve entry module." Abandoned in favor of directly unit-testing `getGitSha()`/`getBuildId()` in isolation (three scenarios: git+repo, no `.git`, no `git` binary) — all three passed cleanly and are the real verification for that feature.
- **What was investigated and ruled out**: A missing Firestore composite index on `session_history_{env}` (`companyCode IN [...] AND userId ==`) as the cause of orders not showing in History. — **Why it failed as a theory**: Checked live Firestore composite indexes and production logs directly — zero index-related warnings in 30 days, GET `/session-history` returns 200 consistently (109 requests in 14 days, all success). The real root cause was the `SubmitPage.vue` navigation-lifecycle gap (see Goal #3), not a backend/index issue. Worth remembering so this isn't re-investigated from scratch.

## Next Step

**Deploy, in this exact order, starting with the env var fix that's been outstanding since an earlier session:**

1. **Fix the worker pool's `GCS_CATALOG_BUCKET` env var** — currently `rgmc-bc-catalog-durable-woods-465907-n1` (doesn't exist), must be `rgmc-bc-catalog`:
   ```
   gcloud beta run worker-pools update rgmc-worker-pool `
     --region=asia-southeast1 --project=durable-woods-465907-n1 `
     --update-env-vars=GCS_CATALOG_BUCKET=rgmc-bc-catalog
   ```
2. **Deploy `rgmc-worker-pool`** (brings in the whole performance rewrite plus all the POUL SO work committed after it):
   ```
   cd C:\claude\rgmc-worker-pool && bash deploy.sh
   ```
   Confirm `y` at the prompt. Before running this, skim `git log -p ce1e213..HEAD -- <files not touched by me>` if you want to sanity-check the unreviewed POUL SO commits don't do anything unexpected — they appear to touch unrelated files based on commit messages, but this wasn't verified.
3. **Trigger a `sync-item-prices` (or `routine-sync`) Pub/Sub message per company** so the worker rebuilds the GCS family blobs against the *correct* bucket — they've never successfully written anywhere until step 1 is done:
   ```
   gcloud pubsub topics publish rgmc-sync --project=durable-woods-465907-n1 `
     --message='{"type":"routine-sync"}'
   ```
4. **Deploy `rgmc-consignment-webapp`** — nothing from today (versioning, history/pending-submission work, order-number fix, brand sort) is live yet. Check whether the Cloud Build GitHub trigger actually fires per-push (it has NOT reliably done so this session — the deployed revision is 8 days stale despite 4 commits landing) before assuming a push alone will deploy it; may need a manual trigger via GCP Console / `gcloud builds submit` / re-checking the Cloud Build trigger configuration.
5. `rgmc-bc-api-prod` is already deployed and current — no action needed there unless further changes are made.

**After deploying**, spot-check: submit a real test order end-to-end (sales + returns), confirm it shows up correctly in History with a real series number (not blank), and confirm the History page shows a live "pending" card while it's processing.

## Context & Gotchas

- **gcloud must be invoked via the PowerShell tool, not Bash** — Bash's `gcloud` shim fails with "Python was not found" on this machine. This applies to every `gcloud`/`gsutil` command in this project.
- **Local Python for compile-checks**: `C:\Users\erarellano\AppData\Local\Programs\Python\Python312\python.exe`. No `google-cloud-*` packages installed locally — isolated tests of `bc-api`/`worker-pool` modules need `google.cloud.*` stubbed via `sys.modules` injection before import (see this session's test snippets if reproducing).
- **The webapp's Cloud Build auto-deploy-on-push is unreliable** — this is the second session where commits piled up (this time: 4 commits, 9 hours) without a matching deploy. Don't assume `git push` alone gets code live; verify the deployed revision's commit label against `git log` before reporting something as "shipped."
- **BC's document number field is `"number"`, not `"no"`** — verified directly against the live BC API (`GET /bc/sales-orders`, `GET /bc/custom/v2/sales-return-orders`) with real production data. There is no `no` field anywhere in these responses. If any *other* BC integration code reads `.no`, it likely has the same bug — this session only fixed the six occurrences found via `grep -rn "\.no\b"` across all three repos related to order series numbers (unrelated `.no` matches like `noSales`/`no-customer` were excluded).
- **`useOrderSubmission.ts` architecture**: module-level singleton refs (not component-local), same pattern as the pre-existing `useSync.ts`/`useServerStatus.ts`/`usePriceListCheck.ts`. A module-scope `watch()` auto-finalizes to Firestore/localStorage the instant every order type the tracked session has lines for reaches `'done'`/`'failed'` — this fires **regardless of which page is mounted**, which is the whole point (submissions used to die silently if the user navigated away mid-poll).
- **`session.store.ts` `markFailed`/`markSubmitted` asymmetry is intentional, not a bug**: no-arg `markFailed()` does NOT clear `currentSession` (original pre-session behavior, preserved deliberately since changing it was out of scope); no-arg `markSubmitted()` always does. Both accept an explicit `target` now (used only by the new composable) which only clears `currentSession` if it still matches by id.
- **Secrets are still plaintext env vars** on all Cloud Run services (`BC_CLIENT_SECRET`, `SMTP_PASSWORD`, `TASK_SECRET`, etc.) — flagged in a prior session's memory note (`project_infra_findings.md`), not addressed, out of scope for all of this session's work.
- **Memory file** `C:\Users\erarellano\.claude\projects\C--claude-rgmc-consignment-webapp\memory\project_infra_findings.md` already documents the GCS bucket mismatch from an earlier session — it is still accurate/unresolved as of this handoff and should be updated (not just left stale) once the bucket fix actually ships.
- **Brand-priority sort** (`HistoryPage.vue` `mergedSessions`) reads the current brand via `StorageService.getAuth()?.brand?.code` inside the `computed()` — not reactive to a brand change without a full reload/re-login (matches the existing convention already used elsewhere in this same file for the pending-card user-scoping, e.g. `pendingCard` computed).
