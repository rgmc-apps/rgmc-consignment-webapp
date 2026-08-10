# Handoff

## Goal

Fix multiple inter-related issues in the RGMC Consignment Web App:

1. **Item price list staleness alerting** — Add a composable (`usePriceListCheck`) that warns users when BC price lists have expired or new ones became effective after their last sync, so they know to re-sync.
2. **Customer cache cross-company contamination** — Scope the customer cache by company code so switching BC companies doesn't show stale customers from the previous company.
3. **Task polling 404 loop** — Fix `GET /tasks/{taskId}` always returning `index.html` (the SPA fallback) because the `/tasks/` path was never proxied through nginx or Vite — so orders always appeared to fail even when BC processed them successfully.
4. **Submit page UX** — Replace the spinner button during order submission with an animated "signal broadcast" loading panel showing Queued → Processing → Confirming steps.

---

## Current State

**All changes from this session are committed and clean. Repo is at `origin/master` HEAD.**

### What was done (all committed):

1. **`usePriceListCheck` composable added** (`src/composables/usePriceListCheck.ts`) — Module-level singleton that calls `GET /bc/custom/price-list-headers?status=Active&type=Sale`, compares headers against today's date and the cached price date, and surfaces two alert types: `expired` (endingDate < today) and `new-available` (startingDate > cachedDate). Alerts are shown as a dismissible banner in `ScanningPage.vue`.

2. **`getPriceListHeaderCatalog` added to ApiService** (`src/services/api.service.ts`) — New method to fetch price list headers with optional `status` and `type` query params.

3. **`PriceListHeader` type added** (`src/types/index.ts`) — Fields: `code`, `description`, `startingDate`, `endingDate`, `currencyCode`.

4. **Price list alert banner added to ScanningPage** (`src/views/ScanningPage.vue`) — Shows dismissible alert rows above the scan form when `hasPriceListAlerts` is true. The `check()` is called on mount and after each sync.

5. **Customer cache scoped by company** (`src/services/storage.service.ts`) — `getCachedCustomers(company?)` / `setCachedCustomers(customers, company?)` now store `{ company, data }` objects. Old plain-array cache format detected via `Array.isArray(raw)` and treated as stale (returns `[]`) when a company code is expected. All callers updated: `useSync.ts`, `LandingPage.vue` (3 calls), `ScanningPage.vue`.

6. **`/tasks/` proxy added** (`nginx.conf` + `vite.config.ts`) — Root-cause fix for the polling loop. Added a `location /tasks/` block in nginx.conf with identical settings to `/bc/` and `/internal/`. Added `'/tasks'` to Vite dev proxy. Previously, `GET /tasks/{taskId}` hit the nginx SPA fallback (`try_files $uri /index.html`) and returned HTML, causing the poller to loop indefinitely.

7. **Submit loading panel** (`src/views/SubmitPage.vue`) — When `salesStatus === 'submitting'` or `returnsStatus === 'submitting'`, the submit button is replaced via `<Transition name="queue-swap">` with a `.queue-loading-panel` div containing animated concentric rings (`.queue-ring--1/2/3`), a queue-icon-wrap, headline, sub-text, step indicators (Queued/Processing/Confirming), and a shimmer bar. Returns variant uses `--returns` modifier classes for danger/red color.

8. **`pollUntilDone` error-resilient** (`src/views/SubmitPage.vue:488`) — Catches transient HTTP errors and retries; only fails after 10 consecutive errors (~30 s). Previously, one transient error immediately propagated as a submission failure.

### What still needs verification:

- **End-to-end test after Docker rebuild** — The `nginx.conf` `/tasks/` fix only takes effect after rebuilding and redeploying the webapp Docker image. The commit is in but the image may not have been rebuilt/pushed yet.
- **Price list alert banner styling** — Added but not visually tested in a browser.
- **Old `order_tasks` Firestore collection** — Still orphaned from the previous session. Safe to delete from the Firestore console; nothing writes to it. Active collection is `order_tasks_production`.

---

## Files Actively Being Edited

All committed. No files in mid-edit state.

- `src/composables/usePriceListCheck.ts` — **New file.** Module-level singleton for price list staleness checks. Calls bc-api headers endpoint, compares against today and `cachedDate`, emits `expired` / `new-available` alerts.
- `src/services/api.service.ts` — Added `getPriceListHeaderCatalog(status?, type?)` method.
- `src/types/index.ts` — Added `PriceListHeader` interface and `PriceListAlertType` / `PriceListAlert` types.
- `src/views/ScanningPage.vue` — Added price list alert banner (template + CSS), imported `usePriceListCheck`, wired `check()` calls on mount and post-sync.
- `src/services/storage.service.ts` — `getCachedCustomers` / `setCachedCustomers` now accept and store `company` code. Old array format treated as stale.
- `src/composables/useSync.ts` — `setCachedCustomers()` call now passes `authStore.company?.code`.
- `src/views/LandingPage.vue` — Three `getCachedCustomers()` calls updated to pass `authStore.company?.code`.
- `nginx.conf` — Added `/tasks/` proxy location block. This was the root-cause fix for the polling loop.
- `vite.config.ts` — Added `'/tasks'` to Vite dev proxy.
- `src/views/SubmitPage.vue` — Loading animation panel for `submitting` state; `pollUntilDone` now retries on transient errors.
- `dist/index.html` — Updated JS bundle hash (rebuilt artifact, committed alongside source changes).

---

## Failed Attempts

- **Firebase REST API for direct Firestore task lookup**: Attempted to bypass bc-api polling by calling the Firestore REST API directly from the webapp. **Why it failed**: No Firebase project — GCP-only Firestore. Client-side access requires Firebase Auth/OAuth2, which the webapp doesn't have. All Firebase env vars and `getTaskDirect()` helper were fully removed after this dead end.
- **Attributing "order success but webapp shows error" to Firestore write failure**: Suspected `update_task(status="done")` was silently failing. **Why it failed**: The actual cause was the `/tasks/` nginx proxy missing — poll requests never reached bc-api at all.
- **Price list header endpoint path uncertainty**: The exact bc-api endpoint path for price list headers needed to be verified before `getPriceListHeaderCatalog` was wired up. The endpoint is `GET /bc/custom/price-list-headers` with `?status=` and `?type=` params.

---

## Next Step

**Rebuild and redeploy the webapp Docker container** so the `nginx.conf` `/tasks/` proxy fix takes effect in production:

```bash
# In rgmc-consignment-webapp root:
docker build -t <registry>/rgmc-consignment-webapp:latest .
docker push <registry>/rgmc-consignment-webapp:latest
# Then redeploy on Cloud Run
```

After redeployment, do a full end-to-end test:
1. Submit a sales order → loading panel (rings + steps) should appear
2. Wait for BC processing (10–30 s typically)
3. Webapp should transition to `salesStatus === 'done'` and show the BC order number
4. Check `order_tasks_production` in Firestore — document should show `status: "done"`

If polling still fails, check bc-api Cloud Run logs for `GET /tasks/{taskId}` — you should see them arriving. If not, the nginx proxy is still not routing.

---

## Context & Gotchas

- **`/tasks/` proxy was the root cause**: The SPA's `try_files $uri /index.html` fallback was silently returning 200 HTML for every task poll. The poller never detected an error, just looped until the 5-minute timeout. Adding the explicit `location /tasks/` block before the SPA fallback fixes this.

- **`usePriceListCheck` is a module-level singleton**: `alerts`, `isChecking`, `isDismissed` are declared outside the composable function. All components that call `usePriceListCheck()` share the same state. Dismissing in one component dismisses globally.

- **Customer cache backwards compatibility**: Old localStorage format is a plain array. `Array.isArray(raw)` detects it and returns `[]` (stale) when a company is passed. Users will be prompted to re-sync once on upgrade — expected behavior.

- **`getPriceListHeaderCatalog` bc-api endpoint**: `GET /bc/custom/price-list-headers` — same company injection as all other `/bc/` calls (interceptor adds `?company=...`). Accepts optional `status` (`Active`, `Inactive`, etc.) and `type` (`Sale`, `Purchase`) query params.

- **Price list alert is advisory only**: The `check()` call wraps in try/catch and silently ignores errors. A failed header fetch doesn't block scanning — users just won't see the staleness warning.

- **`GCP_ENV` on bc-api Cloud Run**: Must be `Production` (capital P; code lowercases internally). Controls which `order_tasks_{env}` Firestore collection is used. If unset or wrong, tasks go to the wrong collection.

- **`pollUntilDone` still uses 3-second intervals**: 5-minute timeout, 10 consecutive error limit. If BC takes >5 min (e.g., large return with many 409 retries), webapp will time out and show "Order is taking too long." Not yet reported as an issue.

- **The old `order_tasks` Firestore collection is orphaned**: Safe to delete from console. No code writes to it. Active collection is `order_tasks_production`.

- **Two async submit routes exist**: `POST /bc/sales-orders/submit` (v1, sales orders) and `POST /bc/custom/v2/sales-orders/submit` (v2, return orders). Both create Cloud Tasks that always hit `/internal/tasks/process-order/{task_id}`. Both use the same `/tasks/{task_id}` polling endpoint.

- **Vite proxy only applies in dev**: In production, nginx.conf is authoritative. Both were fixed. Docker image must be rebuilt for the nginx change to apply.
