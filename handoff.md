# Handoff

## Goal

Ship the RGMC Consignment Web App to production on Cloud Run. The app is a mobile-first Ionic/Vue 3 PWA for sales agents to log consignment sales/return orders, submit to Business Central via GCP API, and track history. Core loop: login → scan → submit.

The current push is to polish and harden the existing feature set: fix all known UX bugs, ensure images work in production, tighten animations, and get the GCP API fully deployed with the latest fixes.

---

## Current State

**Frontend (rgmc-consignment-webapp) — all clean, all committed, ready to deploy:**
- `master` branch is fully up to date with origin, no uncommitted changes
- Latest commits this session:
  - `922cafa` — animations added to ScanningPage + HistoryPage detail modal
  - `e5c5511` — "back online" toast + Sync Now button; offline toast HTML fix
  - `fd09823` — screenshots committed to git (`.gitignore` root-anchored to `/screenshots/`)
  - `12031df` — `public/static/` screenshot images added

**WelcomeModal (`src/components/WelcomeModal.vue`) — fixed this session:**
- Navigation (Get Started / Skip) now works: `can-dismiss="false"` removed, local `isVisible` ref, `finish()` sets `isVisible.value = false`, `@did-dismiss` emits `done`
- Swipe gestures added: `@touchstart.passive` / `@touchend.passive` on `.wm-viewport`, 50px threshold
- Images (`/static/screenshots/*.png`): NOW committed to git; `.gitignore` was `screenshots/` (any depth) → fixed to `/screenshots/` (root only). After next deployment these will appear.

**GCP API (`C:\RGMC\Source\git\rgmc-gcp-api`) — fixed locally, NOT yet deployed:**
- `src/routers/bc_routes/rgmc_contact_routes.py`: BC photo sync is non-blocking, always returns `{"ok": True}` regardless of BC 400 errors (BC Page 50204 not yet created)
- `src/routers/bc_routes/sales_order_routes.py`: `model_dump(mode='json', exclude_none=True)` — fixes "Object of type date is not JSON serializable" on POST/PATCH sales orders

**Known pending (not started):**
- BC Page 50204 (`contactPictures`) AL page has never been created — photo sync to BC is currently skipped (GCP API logs warning, returns success)
- GCP API needs a new Cloud Run deployment to pick up the two Python fixes above

---

## Files Actively Being Edited

All files were left in a clean, working state. Nothing is mid-edit.

- `src/components/WelcomeModal.vue` — 3 bugs fixed: navigation, swipe, images. Uses `isVisible` ref + `@did-dismiss` instead of `can-dismiss="false"`. Touch handlers on `.wm-viewport`.
- `src/App.vue` — Offline toast message changed from HTML string to plain text. "Back online" toast added with Sync Now button that calls `useSync().sync()` and shows a follow-up result toast.
- `.gitignore` — Changed `screenshots/` to `/screenshots/` so `public/static/screenshots/` is no longer excluded from git.
- `.dockerignore` — Changed `screenshots/` to `/screenshots/` (done in previous session, already committed as `4b410a8`).
- `public/static/screenshots/` — 4 PNG files now committed: `03-landing.png`, `04-scanning-form.png`, `06-history.png`, `08-submit.png`
- `src/views/ScanningPage.vue` — Entrance animations added: form column card stagger, order list item stagger (6 nth-child), order segment + empty-orders fade-in
- `src/views/HistoryPage.vue` — Detail modal content entrance added: info-card → section-block → grand-total-row → retry-wrap cascade (0 / 60 / 130 / 170ms)
- `C:\RGMC\Source\git\rgmc-gcp-api\src\routers\bc_routes\rgmc_contact_routes.py` — Non-blocking BC photo sync (local only, not deployed)
- `C:\RGMC\Source\git\rgmc-gcp-api\src\routers\bc_routes\sales_order_routes.py` — `mode='json'` on model_dump (local only, not deployed)

---

## Failed Attempts

- **What was tried**: Using `can-dismiss="false"` on `<ion-modal>` while controlling visibility via `:is-open` prop — **Why it failed**: Ionic 8 `can-dismiss="false"` blocks ALL modal dismissal including programmatic. When parent set `:is-open="false"`, modal refused to close. Fix: remove `can-dismiss`, use local `isVisible` ref.

- **What was tried**: Importing screenshot images as Vite module imports (`import landingImg from '../../screenshots/03-landing.png'`) — **Why it failed**: Vite can't resolve paths outside `src/` or `public/`; screenshots were in root `screenshots/` folder. Fix: move to `public/static/screenshots/` and use string URL constants.

- **What was tried**: Fixing `.dockerignore` to `/screenshots/` to include `public/static/screenshots/` in Docker build context — **Why it failed**: `.gitignore` also had `screenshots/` (unanchored), so the files were never committed to git. Cloud Run deployments pull from git, not local disk. Fix: also fix `.gitignore` and `git add` the PNG files.

- **What was tried**: `toastController.create({ message: '<div class="..."><strong>...' })` for styled offline toast — **Why it failed**: Ionic's toast `message` field renders plain text, not HTML. Tags showed as raw text. Fix: use a plain text string.

---

## Next Step

**Deploy the GCP API to Cloud Run.** The two Python fixes are local-only and the production API still has the old code:

1. Navigate to `C:\RGMC\Source\git\rgmc-gcp-api`
2. Commit the two changed files:
   ```
   git add src/routers/bc_routes/rgmc_contact_routes.py src/routers/bc_routes/sales_order_routes.py
   git commit -m "make BC photo sync non-blocking; fix date JSON serialization in sales orders"
   ```
3. Deploy to Cloud Run (use whatever CI/CD or `gcloud run deploy` command the project uses)
4. Verify: POST a sales order with an `orderDate` field — should no longer 500 with "Object of type date is not JSON serializable"
5. Verify: update a contact photo — should return `{"ok": True}` even if BC 400s

**After GCP deploy:** redeploy the frontend to Cloud Run to pick up all frontend commits from this session (WelcomeModal fixes, animations, images, toasts).

---

## Context & Gotchas

- **Two separate repos**: frontend at `C:\claude\rgmc-consignment-webapp`, GCP API at `C:\RGMC\Source\git\rgmc-gcp-api`. The frontend proxies `/bc/*` to the GCP API via nginx (`nginx.conf` proxy_pass). They deploy independently to Cloud Run.

- **Cloud Run URLs**: frontend is `https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app`, GCP API is `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`

- **Screenshot URL pattern**: `/static/screenshots/03-landing.png` — served by nginx from `dist/static/screenshots/` which Vite copies from `public/static/screenshots/` during build. NOT a hashed asset, served via `location /` → `try_files`.

- **Photo sync (BC)**: BC Page 50204 (`contactPictures`) OData endpoint does not exist yet. The GCP API's `update_contact_picture` will return HTTP 400 "Cannot convert literal to Edm.Guid" from BC. The fix makes this non-fatal: GCP API logs a warning and returns `{"ok": True}`. Photos are stored client-side via IndexedDB only until the AL page is created.

- **`useSync` is a module-level singleton**: All components that call `useSync()` share the same `isSyncing` / `lastSyncDate` reactive state. The "Sync Now" button in App.vue toast and the ScanningPage sync button share state — tapping it while already syncing is a no-op.

- **Dark mode**: Toggled via `data-theme="dark"` on `<html>`. CSS variables in `src/theme/variables.css` flip automatically. Native date inputs need `color-scheme: light/dark` per-element (already handled in ScanningPage).

- **Auth flow**: bcryptjs client-side hash comparison. `SetPasswordModal` shown on first login if no bcrypt hash stored. `WelcomeModal` shown once per contact (gated by `StorageService.hasSeenWelcome()`). Both are overlaid on `LandingPage`.

- **Ionic 8 gotcha**: `ion-modal` with `can-dismiss` has a breaking behavior change vs Ionic 7. Never use `can-dismiss="false"` if you need programmatic close. Use a local ref + `@did-dismiss`.

- **`.dockerignore` / `.gitignore` glob depth**: Both tools treat `screenshots/` as matching at any depth. `/screenshots/` is root-anchored. Both files now use `/screenshots/` — this was a three-layer bug (wrong import type → wrong location → wrong ignore pattern) that caused WelcomeModal images to not appear on deployed version.

- **Animation tokens in `src/theme/variables.css`**: `--ease-out-quart`, `--ease-out-expo`, keyframes `fade-slide-up`, `fade-in`, `icon-pop`, `theme-icon-swap` are all global. All per-screen animations use these globals so behavior is consistent. `prefers-reduced-motion` guard at bottom of variables.css kills all animation/transition durations globally.
