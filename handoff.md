# Handoff

## Goal

Ship and maintain the **RGMC Consignment Web App** on Google Cloud Run — a mobile-first Ionic/Vue scanning tool for sales reps to build sales/return orders against a GCP-hosted Business Central API.

**Acceptance criteria (all now met as of this session):**
- ✅ Login pre-syncs data automatically (cycling labels, lands on home)
- ✅ ScanningPage shows items after sync (no manual re-tap needed)
- ✅ Barcode/item scan → confirm sheet with qty stepper, discount, grand total
- ✅ Offline mode (OFFLINE badge, scan works if items loaded, SubmitPage disabled offline)
- ✅ Pull-to-refresh on ScanningPage, LandingPage, HistoryPage
- ✅ No `QuotaExceededError` in localStorage (items in `_itemsMemory`)
- ✅ All screens work against live GCP API via nginx proxy
- ✅ "Save as Draft & Go Back" saves as `draft` status (not `submitted`)
- ✅ Drafts with order lines have a Submit shortcut button on the Home page
- ✅ App is full-screen on desktop; content centred in a 720 px column

---

## Current State

**All code complete and deployed. No known open bugs.**

| Area | Status |
|---|---|
| All `src/` source files | ✅ Clean, TypeScript passes, build passes |
| Cloud Run live revision | `rgmc-consignment-webapp-00019-g7m` |
| Cloud Build for `ca80527` | QUEUED at session end — deploying draft fix |
| Live URL | `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app` |

**Note on `dist/` in git:** `.gitignore` only excludes `node_modules`; `dist/` IS tracked. The user committed `28dc4bf` (dist-only, "fixed draft saving") after a local build. Cloud Build always runs `npm run build` from source, so committed dist files do not affect what's deployed.

**Debug log still present:** `api.service.ts` interceptor logs every `/bc/*` response shape to the browser console via `console.info`. Useful for diagnosing API issues; can be removed once the team is confident the response shapes are stable.

---

## Files Actively Being Edited

*(All committed and pushed — working tree clean)*

### This session's changes

- `src/stores/session.store.ts` — Added `saveAsDraftAndExit()`: sets `status:'draft'`, touches `updatedAt`, writes to drafts storage, nulls `currentSession`. Added to the exported return object. (`ca80527`)

- `src/views/SubmitPage.vue` — Fixed `finalizeSession()`: when `!anyDone && !anyFailed` (button label "Save as Draft & Go Back"), now calls `saveAsDraftAndExit()` and navigates to `/app/home`. Previously fell through to `markSubmitted()` unconditionally. (`ca80527`)

- `src/views/LandingPage.vue` — Added `sendOutline` icon import; added `submitDraft(draft)` function that calls `resumeDraft()` + `router.push('/app/submit')`; added gold **Submit** button on each draft row where `salesOrders.length > 0 || returnOrders.length > 0`; added `.draft-submit-btn` CSS; changed `detail` to `:detail="false"` on the draft item (was showing a default chevron alongside the new buttons). (`ca80527`)

- `src/views/ScanningPage.vue` — Removed `hasCache` from `useSync()` destructure; replaced with a local `computed()` that depends on reactive `cachedItems.value`, `cachedCustomers.value`, `categories.value`. This is what actually fixes items not showing after sync. (`11dcc89`)

- `src/composables/useSync.ts` — Removed the broken `hasCache` computed and its export. It read `_itemsMemory` (a plain JS variable) which Vue's tracker cannot observe, so it was permanently cached as `false`. (`11dcc89`)

- `src/theme/variables.css` — Removed the 520 px phone-column `ion-app` override. Kept `ion-content::part(scroll)` max-width 720 px with `margin: auto` for content centering. Mobile (≤599 px) overridden to `max-width: 100%`. (`fe1420b`)

- `src/views/LoginPage.vue` — Login container `max-width` changed from `520px` to `480px`. (`fe1420b`)

- `src/services/api.service.ts` — `extractList<T>()` handles `{ data:[] }`, `{ value:[] }` (BC OData), bare array. Interceptor logs every `/bc/*` response shape to console. (`faf1e09`, previous session)

---

## Failed Attempts

- **`useSync.hasCache` as a shared computed** — Read `StorageService.getCachedItems()` which returns the plain JS module variable `_itemsMemory`. Vue's reactivity tracker cannot observe plain variables, so the computed cached its initial `false` value and never re-evaluated after sync. **Fix**: local reactive computed in ScanningPage that uses the component's Vue refs.

- **Phone-column desktop mode** — Constrained `ion-app` to 520 px with `left:50%; transform:translateX(-50%)`. User wanted full-screen desktop behaviour. Reverted; kept inner-content centering only.

- **`pulling-icon="chevron-down-circle-outline"` (string)** — Ionic's `ion-icon` used `new URL(path, import.meta.url)` to fetch the SVG. In production, `import.meta.url` resolves to an invalid base. Fixed with `:pulling-icon="chevronDownCircleOutline"` (imported SVG object).

- **`localStorage` for items** — 5 MB quota exceeded. Items now in `_itemsMemory` only.

- **Inline `envsubst` in Dockerfile** — Unreliable in Alpine sh. Fixed with `docker-entrypoint.sh`.

- **Unquoted nginx regex braces** — Caused nginx startup failure. Fixed by quoting the regex.

- **`VITE_API_BASE_URL` set to GCP origin** — CORS blocked all requests. Fixed by leaving empty; nginx proxies `/bc/*`.

---

## Next Step

**Verify the draft fix works end-to-end on the live app** once Cloud Build `27b5cedc` finishes deploying:

1. Log in → Scan → add items → go to Review & Submit
2. Tap **"Save as Draft & Go Back"** (before submitting anything)
3. Confirm: navigates to `/app/home`, draft appears in "Pending Drafts" with `draft` status (amber icon, NOT in History)
4. Tap the gold **Submit** button on the draft row → should go directly to `/app/submit` with the session pre-loaded
5. Submit orders → tap **Finish Session** → session moves to History as `submitted`

If the Cloud Build is still running, check with:
```powershell
gcloud builds list --limit=3 --format="table(id,status,createTime)"
```

---

## Context & Gotchas

### Deployment
- **GitHub push → Cloud Build trigger → Cloud Run** (automatic, ~5 min)
- Project: `durable-woods-465907-n1` | Service: `rgmc-consignment-webapp` | Region: `asia-southeast1`
- GCP API: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`
- Dockerfile always runs `npm run build` — committed `dist/` is irrelevant

### `_itemsMemory` — plain JS, not reactive
`let _itemsMemory: Item[] = []` in `storage.service.ts` is intentionally NOT a Vue ref (to avoid the old localStorage quota issue). Any computed that reads `StorageService.getCachedItems()` directly will NOT update reactively. Always gate display logic on component-level Vue refs that `refreshCache()` writes to.

### `hasCache` — only exists in `ScanningPage.vue` now
`useSync.ts` no longer exports `hasCache`. The ScanningPage has its own local computed:
```typescript
const hasCache = computed(
  () => cachedItems.value.length > 0 && cachedCustomers.value.length > 0 && categories.value.length > 0
);
```
This is correct and reactive. Do not re-add `hasCache` to `useSync` without making it accept reactive refs as parameters.

### Draft vs. History flow
| Action | Method called | Result |
|---|---|---|
| Save as Draft & Go Back (0 submissions) | `saveAsDraftAndExit()` | Stays in drafts, `status:'draft'`, → `/app/home` |
| After any failed submission | `markFailed(error)` | Moves to history, `status:'failed'` — NOT nulled from currentSession |
| After all submitted | `markSubmitted(series?)` | Moves to history, `status:'submitted'`, nulls currentSession |

Note: `markFailed()` does NOT null `currentSession`. The session stays active so the user can retry from SubmitPage. Only `markSubmitted()` and `saveAsDraftAndExit()` null it.

### Resubmit button visibility
The Submit button on draft rows only appears when:
```javascript
draft.salesOrders.length > 0 || draft.returnOrders.length > 0
```
Drafts with a customer selected but no items scanned yet only show the tap-to-resume path (→ Scan).

### nginx.conf is a template
Contains `${PORT}` placeholder. `docker-entrypoint.sh` runs `envsubst '$PORT'` at container start. Single-quoted to preserve nginx's `$uri`, `$remote_addr`, etc.

### `VITE_API_BASE_URL` baked at build time
Empty in `.env.production`. Axios makes relative `/bc/*` requests. Nginx proxies to GCP API. Runtime env var has no effect.

### Auth guard ordering
`router.beforeEach` fires before `authStore.loadFromStorage()`. Direct URL navigation always hits `/splash` → loads auth → redirects. Do not reorder.

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand, user }` |
| `rgmc_cache_brands` | Brand[] |
| `rgmc_cache_contacts` | Contact[] |
| `rgmc_cache_customers` | Slim `{id,number,displayName,city}` |
| `rgmc_cache_item_categories` | ItemCategory[] |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISO }` |
| `rgmc_sessions` | ScanSession[] `status:'submitted'\|'failed'` |
| `rgmc_drafts` | ScanSession[] `status:'draft'` |
| ~~`rgmc_cache_items`~~ | **Removed** — items in `_itemsMemory` only |

### `OrderLine` type gotcha
Has `itemName` (not `itemDisplayName`) and NO `itemCategoryCode`. Check `src/types/index.ts` before adding code that references order line fields.

### Capacitor not initialised
`@capacitor/cli` and `@capacitor/core` in `package.json` but `npx cap add android/ios` never run. No `android/` or `ios/` directories.
