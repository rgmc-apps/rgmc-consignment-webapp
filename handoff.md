# Handoff

## Goal

Migrate the RGMC system so that **all heavy sync work (BC → Firestore) runs in the worker pool**, not the bc-api. The bc-api internal sync endpoints now publish Pub/Sub messages; the worker pool handles execution. Item price reads in the bc-api and the consignment webapp are served exclusively from Firestore — Business Central is no longer hit on every read request.

## Current State

All changes are committed and pushed. Cloud Build CI/CD is triggered automatically on push to master in both repos. As of this session:

**Worker pool (`C:\claude\rgmc-worker-pool`):**
- Latest commit: `ce27319` — price list items sync
- SMTP `starttls()` bug is fixed (`3cf88e5`)
- `_active_bc_requests` UnboundLocalError is fixed (`c0a09de`)
- Routine sync now does three steps per company: (1) price list headers + items per code, (2) v3 item price catalog
- Handles Pub/Sub message types: `routine-sync`, `sync-item-prices`, `sync-price-list-headers`, `sync-price-list-items`, `ping`
- Email (SMTP) notifications send on success and failure via `notify_success`/`notify_error`

**bc-api (`C:\claude\rgmc-bc-api`):**
- Latest commit: `e589bc4` — v3 item prices Firestore-only
- Internal sync endpoints (`/internal/firestore/sync-item-prices`, `/internal/firestore/sync-price-list-headers`, `/internal/firestore/sync-price-list-items`, `/internal/firestore/routine-sync`) now publish Pub/Sub messages to `rgmc-sync` topic and return 202
- `GET /bc/custom/v3/item-prices` is Firestore-only (no BC fallback); returns 503 if catalog empty, 400 if OData `filter` param used
- `GET /bc/custom/v3/item-prices/count` is Firestore-only
- `GET /bc/custom/v3/item-prices/{id}` still reads from BC (Firestore keyed by productNo not SystemId)
- New endpoints: `POST /internal/firestore/sync-price-list-items`, `GET /bc/custom/v2/price-list-items`
- Pub/Sub publisher: `src/services/pubsub_publisher.py`

**Consignment webapp (`C:\claude\rgmc-consignment-webapp`):**
- Latest commit: `5d249cb`
- `useSync.ts` sync function now uses `getItemsForDate` (single Firestore call) instead of a paginated loop of `getItemsPaged` calls

**What is NOT yet verified:**
- Cloud Build deployment for the new worker pool image — may take a few minutes after push
- End-to-end test of the new `sync-price-list-items` flow (whether BC's `$expand=priceListLines` actually returns line items in the RGMC custom v2 API — this is unconfirmed)
- Whether the routine sync sends an email successfully (first full run since starttls fix)

## Files Actively Being Edited

All files are clean — no mid-edit state. Everything committed.

**Worker pool:**
- `C:\claude\rgmc-worker-pool\src\services\bc_client.py` — added `fetch_price_list_headers_with_lines()` (fetches headers with `$expand=priceListLines`); fixed missing `global _active_bc_requests` in `_fetch_all_pages`
- `C:\claude\rgmc-worker-pool\src\services\price_firestore_service.py` — added `price_list_items_{env}` collection; `sync_price_list_items_to_firestore()`; `get_price_list_items_from_firestore()`; doc ID: `{company}_{priceListCode}_{lineNo}`
- `C:\claude\rgmc-worker-pool\src\services\send_mail.py` — fixed `server.starttls(ctx)` → `server.starttls(context=ctx)` in both `_send()` and `_send_success()`
- `C:\claude\rgmc-worker-pool\src\workers\sync_worker.py` — `_sync_company` now uses `fetch_price_list_headers_with_lines` (strips lines before writing headers, syncs items per code); added `sync-price-list-items` handler; updated `sync-price-list-headers` handler

**bc-api:**
- `C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_firestore_routes.py` — all three sync endpoints publish to Pub/Sub (202); new `POST /internal/firestore/sync-price-list-items`; new `GET /bc/custom/v2/price-list-items`
- `C:\claude\rgmc-bc-api\src\routers\bc_routes\rgmc_item_price_v3_routes.py` — removed BC fallback from list/count; Firestore-only; 503 if empty; 400 if OData filter
- `C:\claude\rgmc-bc-api\src\services\price_firestore_service.py` — added `_price_list_items_collection()`, `get_price_list_items_from_firestore()`
- `C:\claude\rgmc-bc-api\src\services\pubsub_publisher.py` — created last session; publishes JSON to `PUBSUB_SYNC_TOPIC`
- `C:\claude\rgmc-bc-api\src\config.py` — `PUBSUB_SYNC_TOPIC` env var added last session

**Webapp:**
- `C:\claude\rgmc-consignment-webapp\src\composables\useSync.ts` — replaced paginated `getItemsPaged` loop with single `getItemsForDate` call for items & prices sync step

## Failed Attempts

- **What was tried**: Running `gcloud run services list` to find the worker pool — **Why it failed**: Worker pools are separate from Cloud Run services; must use `gcloud beta run worker-pools list`
- **What was tried**: `--min-instances` flag on worker pool deploy — **Why it failed**: Worker pools use `--scaling=N` for fixed instance count, not `--min-instances`
- **What was tried**: `gcloud pubsub subscriptions pull` for diagnostics — **Why it failed**: Ran without `--no-ack`, permanently consumed 3 backlogged messages; always use `--no-ack` for diagnostic pulls
- **What was tried**: `server.starttls(ctx)` (positional arg) in send_mail.py — **Why it failed**: Python's `smtplib.SMTP.starttls()` requires the SSL context as keyword arg `context=ctx`; raised `TypeError: SMTP.starttls() takes 1 positional argument but 2 were given`
- **What was tried**: `_fetch_all_pages` accessing `_active_bc_requests` without `global` declaration — **Why it failed**: Python treats `_active_bc_requests += 1` as a local assignment, making the variable unbound; `UnboundLocalError`. Fixed by adding `global _active_bc_requests` at top of `_fetch_all_pages`
- **What was tried**: `/internal/firestore/routine-sync` calling sync directly in bc-api background thread — **Why it failed**: Worker pool never received the task; bc-api was doing sync internally via `threading.Thread(_routine_sync_task, ...)` without publishing to Pub/Sub; now replaced with Pub/Sub publish

## Next Step

**Verify the price list items sync works end-to-end.** Trigger a targeted sync via the bc-api Swagger (`/swagger`) or curl:

```
POST /internal/firestore/sync-price-list-items?company=RGMC
X-Task-Secret: <TASK_SECRET>
```

Watch Cloud Logging for the worker pool (`run.googleapis.com%2Fstdout`) for:
- `INFO bc_client — ...` (fetch of priceListHeaders with expand)
- `INFO worker.sync — [RGMC] price list items [<code>]: N written`

If you see a BC 400 error mentioning `$expand`, the RGMC custom v2 API (Pag50320) does not support `$expand=priceListLines`. In that case the fix is: iterate headers and fetch lines per header via a sub-resource URL — `GET /companies({id})/priceListHeaders({headerId})/priceListLines` — rather than using expand.

Then trigger a full routine sync and confirm email is received:
```
POST /internal/firestore/routine-sync
X-Task-Secret: <TASK_SECRET>
```

## Context & Gotchas

- **GCP project**: `durable-woods-465907-n1`, region: `asia-southeast1`
- **Worker pool SA**: `rgmc-worker-pool@durable-woods-465907-n1.iam.gserviceaccount.com` — needs `roles/pubsub.subscriber` (was missing; added manually via Cloud Shell last session)
- **bc-api SA**: `935246372408-compute@developer.gserviceaccount.com` — needs `roles/pubsub.publisher` on `rgmc-sync` topic
- **Worker pool scaling**: `--scaling=1` (fixed 1 instance, always running to pull Pub/Sub); `--min-instances` is NOT valid for worker pools
- **Cloud Build CI/CD**: both bc-api and worker pool auto-deploy on push to master (2-4 min build time)
- **Pub/Sub topic**: `rgmc-sync`; subscription: `rgmc-sync-worker-sub` (pull subscription)
- **Firestore collections** (all environment-suffixed, e.g. `_production`):
  - `item_prices_{env}` — v3 catalog (one price per product); doc ID: `{company}_{productNo}`
  - `price_list_headers_{env}` — doc ID: `{company}_{code}`
  - `price_list_items_{env}` — NEW this session; doc ID: `{company}_{priceListCode}_{lineNo}`
- **Price list items expand risk**: The key unknown is whether `$expand=priceListLines` is supported on the RGMC custom v2 API. If BC returns a 400, `_fetch_all_pages` will raise and the worker logs will show the error. The bc-api's GET price-list-headers endpoint has an `expand` query param that works, but the worker pool uses a different URL constructed in `bc_client.py`.
- **bc-api sync endpoints changed contract**: old sync endpoints returned counts synchronously (200 OK). They now return 202 with a `message_id`. Any Cloud Scheduler jobs or monitoring that checked the response body for `written` counts need updating.
- **v3 list endpoint 503 behavior**: 503 is only raised when the catalog is empty AND no filters are applied. Filtered queries (family_code, product_no, etc.) return empty results normally — empty is a valid filtered result.
- **Webapp sync change**: `useSync.ts` now calls `getItemsForDate(today, brandCode)` (no pagination). If Firestore catalog is empty (not yet synced), the endpoint returns 503, which `getItemsForDate` will catch and the webapp will show "server is still loading" warning. Run routine-sync first before testing webapp.
- **Cloud Shell bash quirk**: Backtick line continuation (`\``) doesn't work in Cloud Shell bash. Use single-line commands or `;`. Run `gcloud config set run/region asia-southeast1` first to avoid interactive region prompts.
- **IAM conditional bindings**: GCP project uses conditional IAM; `gcloud projects add-iam-policy-binding` prompts for a condition — select "None" (option 2).
- **Repo locations**:
  - `C:\claude\rgmc-worker-pool` → GitHub: `erar404/rgmc-worker-pool` (moved from `rgmc-apps/rgmc-worker-pool`)
  - `C:\claude\rgmc-bc-api` → GitHub: `rgmc-apps/rgmc-bc-api`
  - `C:\claude\rgmc-consignment-webapp` → GitHub: `rgmc-apps/rgmc-consignment-webapp`
