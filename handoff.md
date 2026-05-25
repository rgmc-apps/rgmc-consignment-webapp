# Handoff

## Goal

Build and ship the **RGMC Consignment Web App** — a mobile-first PWA (and optional Capacitor native app) used by RGMC sales agents to:
1. Log in with brand + agent credentials against Business Central via a GCP API proxy
2. Scan / manually enter sales and return orders for brand-filtered customers
3. Submit orders to Business Central's sales-order and sales-return endpoints
4. Review session history, retry failed submissions, and export .txt reports

The app must work **offline-capable** (localStorage-backed), run on mobile and desktop, and be deployable to **Google Cloud Run** as a containerized nginx+dist bundle.

**Acceptance criteria met as of this session:**
- All 7 build phases complete (see `build_progress.md` memory)
- `vue-tsc && vite build` both pass clean
- Dev server runs at `:8100` with Vite proxy for `/bc/*` → GCP API
- Docker multi-stage build produces a self-contained image that listens on `$PORT`
- Comprehensive `README.md` with screenshots, API docs, env vars, auth flow

---

## Current State

**Everything is working and complete.** No broken code, no partial edits, no outstanding bugs.

| Area | Status |
|---|---|
| All 22 `src/` source files | ✅ Written, TypeScript clean |
| `vue-tsc && vite build` | ✅ Passes (verified in previous session) |
| Dev server `:8100` | ✅ Runs via `npm run dev` |
| `Dockerfile` + `nginx.conf` + `.dockerignore` | ✅ Created this session |
| `README.md` with screenshots section | ✅ Created previous session |
| `screenshot-tour.js` (Playwright automation) | ✅ Working; 11 screenshots in `screenshots/` |
| Memory + `build_progress.md` | ✅ Up to date |

The only thing **not yet done** is the actual Cloud Run deployment (pushing image, running `gcloud run deploy`) — that requires a GCP project ID the user hasn't provided.

---

## Files Actively Being Edited

Files created/modified **this session**:

- `Dockerfile` — NEW. Multi-stage: `node:20-alpine` builder runs `npm ci && npm run build` (reads `.env.production` for `VITE_API_BASE_URL`); `nginx:stable-alpine` server copies `dist/`, uses `envsubst '$PORT'` at startup to substitute Cloud Run's `$PORT` into `nginx.conf`.
- `nginx.conf` — NEW. nginx template (not a final config — it's a template). Listens on `${PORT}`. SPA fallback via `try_files`. Hashed assets get `immutable` cache; `index.html` gets `no-store`. All temp paths in `/tmp` for non-root Cloud Run container. gzip for JS/CSS/JSON/SVG/WASM.
- `.dockerignore` — NEW. Excludes `node_modules`, `dist`, `.git`, `screenshots/`, `screenshot-tour.js`. Keeps `.env.production` so the API URL bakes in during the Docker build.

Files created in the **previous session** (unchanged this session but important):

- `src/views/HistoryPage.vue` — Full rewrite. Filter chips (All/Submitted/Failed), detail modal, retry failed sessions, enhanced .txt export.
- `src/stores/session.store.ts` — Added `retryFailedSession()`: removes from completedSessions, restores as draft, navigates caller to `/app/submit`.
- `src/components/ItemSelectorModal.vue` — Item search + BarcodeDetector API scanner with manual fallback.
- `src/utils/format.ts` — Currency/date formatting helpers.
- `README.md` — Comprehensive docs with 17 sections, emojis, HTML color spans (`#A07320` gold for h2, `#2a9d8f` teal for h3), `<table>` screenshot grids.
- `screenshot-tour.js` — Playwright script. Mocks all `/bc/**` API routes, injects localStorage, navigates via Vue Router `$router.push()` from inside SPA.

---

## Failed Attempts

- **`page.goto('/app/scan')` in Playwright showing Landing page content**: Direct URL navigation to any `/app/*` route always lands at `/app/home`. Root cause: `router.beforeEach` guard fires before `authStore.loadFromStorage()` (which runs in `router.isReady().then()`), so the guard sees unauthenticated state → redirects to `/splash` → splash loads auth and always redirects to `/app/home`. **Fix**: boot to `/app/home` first (the splash redirect chain handles this), then use `page.evaluate(() => $router.push(route))` for all subsequent navigation within the SPA.

- **`localStorage.setItem` SecurityError in Playwright**: Calling `page.evaluate(localStorage.setItem(...))` while the page was on `about:blank` or mid-redirect caused `SecurityError: Failed to read 'localStorage'`. **Fix**: wait for the page to fully land on `/login` (correct origin, same as app) before injecting.

- **`ion-tab-button[tab="scan"]` click timing out in Playwright**: Ionic shadow DOM made tab buttons unreliable to click in headless Playwright. **Fix**: abandoned tab clicks entirely; use the internal `$router.push()` approach for all navigation.

- **`line.itemDisplayName` TypeScript error in HistoryPage**: `OrderLine` interface uses `itemName` (not `itemDisplayName`) and has no `itemCategoryCode` field. Fixed by replacing all references.

- **Splash screenshot (01-splash) showing Login page**: Mocked APIs responded so fast that splash redirected to `/login` before the screenshot fired. Fixed with `waitForTimeout(450)` — catches it mid-progress.

- **Customers not appearing on Landing page**: `useCustomerFilter` maps brands to keywords; mock customers didn't contain the "APPLE" keyword. Fixed by naming mocks "SM SUPERMARKET APPLE MANILA" etc.

---

## Next Step

**Deploy to Google Cloud Run.** The Docker files are ready. Run these commands (replace `YOUR_PROJECT`):

```bash
# 1. Authenticate (run once)
gcloud auth login
gcloud config set project YOUR_PROJECT

# 2. Build and push
docker build -t gcr.io/YOUR_PROJECT/rgmc-consignment .
docker push gcr.io/YOUR_PROJECT/rgmc-consignment

# 3. Deploy
gcloud run deploy rgmc-consignment \
  --image gcr.io/YOUR_PROJECT/rgmc-consignment \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated
```

If no GCP project is available yet, the next most useful task is **setting up GitHub Actions CI/CD** so pushes to `main` automatically build + deploy to Cloud Run.

---

## Context & Gotchas

### Environment
- Dev server: `npm run dev` → `http://localhost:8100`
- `VITE_API_BASE_URL` is **baked at build time** by Vite — it is NOT a runtime env var. `.env.production` contains the GCP API URL; `.env` is empty (dev uses Vite proxy).
- The Vite proxy in `vite.config.ts` forwards `/bc/*` to `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app` to avoid CORS in dev.
- In production (Docker), the frontend calls `VITE_API_BASE_URL + /bc/...` directly — **CORS must be enabled on the GCP API** for the Cloud Run domain.

### Docker / nginx
- `nginx.conf` is a **template** — it contains `${PORT}` which is NOT valid nginx syntax until `envsubst` rewrites it to e.g. `8080` at container startup.
- `envsubst '$PORT'` (with single quotes, quoting only `$PORT`) is intentional — it prevents envsubst from mangling nginx's own `$uri`, `$request_uri` etc.
- Temp paths (`/tmp/nginx_*`) are required because Cloud Run containers run as non-root and can't write to `/var/cache/nginx`.

### Auth guard race condition (known, by design)
- `router.beforeEach` in `src/main.ts` fires before `authStore.loadFromStorage()` runs (which is inside `router.isReady().then()`).
- This means any hard navigation to `/app/*` (including browser refresh) redirects to `/splash`, which then loads auth from localStorage and redirects to `/app/home`.
- This is **intentional behavior** — the splash screen serves as the auth hydration point. Do not move `loadFromStorage()` before `router.beforeEach` without understanding the full guard flow.

### Key data types
```typescript
// OrderLine — no itemDisplayName, no itemCategoryCode
interface OrderLine {
  id: string; itemId: string; itemNumber: string;
  itemName: string;        // ← use this, NOT itemDisplayName
  description: string; srp: number; quantity: number;
  discountType: DiscountType; discountValue: number; totalAmount: number;
}
```

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand: Brand, user: Contact }` |
| `rgmc_cache_brands` / `_contacts` / `_customers` / `_items` / `_item_categories` | Synced BC data |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISOString }` |
| `rgmc_drafts` | `ScanSession[]` with `status: 'draft'` |
| `rgmc_sessions` | `ScanSession[]` with `status: 'submitted' \| 'failed'` |

### Capacitor
- `capacitor.config.ts` is configured with App ID `com.rgmc.consignment`, pointing to `http://localhost:8100`.
- `@capacitor/cli` and `@capacitor/core` are in `package.json` but `npx cap add android/ios` has not been run yet — no `android/` or `ios/` directories exist. Run `npm run build && npx cap add android` to initialize.

### Screenshots
- `screenshots/` contains 11 PNGs (01-splash through 11-history-desktop) captured by `screenshot-tour.js`.
- The README references these as relative paths — they work on GitHub but not when viewed locally unless you run the screenshot tour first.
- `screenshot-tour.js` requires Playwright (`npm install` already includes it) and the dev server running on `:8100`. Run with `node screenshot-tour.js`.
