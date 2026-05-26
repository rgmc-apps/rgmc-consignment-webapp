# Handoff

## Goal

Ship the **RGMC Consignment Web App** to production on Google Cloud Run, fully working end-to-end. All application phases (1–7) are complete. The remaining work is purely infrastructure: the Docker image must build, deploy, and serve the app correctly with all API calls reaching the GCP backend without CORS errors.

Secondary deliverables this session also completed: comprehensive `README.md` with screenshots, `PRODUCT.md` for the impeccable skill, and purposeful animations across all six screens.

**Acceptance criteria:**
- App loads at the Cloud Run URL
- Splash screen loads brands + contacts from GCP API (via nginx proxy, no CORS)
- Login, scanning, submit, and history all function against the live GCP API
- `vue-tsc && vite build` passes clean (currently confirmed)

---

## Current State

**All application code: COMPLETE AND WORKING.** `vue-tsc --noEmit` passes, `vite build` passes cleanly.

**Cloud Run deployment: PARTIALLY RESOLVED.** Three distinct infrastructure bugs were fixed this session. The latest fix (CORS proxy) has NOT yet been re-deployed — the user needs to rebuild and redeploy the image.

| Area | Status |
|---|---|
| All 22 `src/` source files | ✅ Complete, TypeScript clean |
| `vite build` | ✅ Passes, all chunks generated |
| Animations across all 6 screens | ✅ Added this session |
| `Dockerfile` + `nginx.conf` + `docker-entrypoint.sh` | ✅ Fixed (3 bugs found and resolved) |
| `.env.production` | ✅ Updated — `VITE_API_BASE_URL` cleared to empty |
| Cloud Run deployment | ⏳ **Needs rebuild + redeploy with CORS fix** |
| `PRODUCT.md` | ✅ Created for impeccable skill |
| `README.md` | ✅ Complete with screenshots |

---

## Files Actively Being Edited

Files changed **this session** (all in a stable, working state):

- `Dockerfile` — Two changes: (1) fixed `CMD` inline envsubst approach → `ENTRYPOINT ["/docker-entrypoint.sh"]` for robust startup; (2) added `ca-certificates` to `apk add` for nginx TLS to the upstream API.
- `nginx.conf` — Three changes: (1) fixed unquoted location regex containing `{8}` which nginx parsed as block syntax; (2) added `location /bc/` proxy block that forwards API calls server-side to the GCP API (eliminates CORS entirely); (3) added `resolver 8.8.8.8 8.8.4.4` required for dynamic upstream DNS resolution.
- `docker-entrypoint.sh` — NEW. Runs `envsubst '$PORT'` to substitute PORT into nginx config, then `nginx -t` for config validation, then `exec nginx -g 'daemon off;'` (exec makes nginx PID 1).
- `.dockerignore` — Updated to exclude `handoff.md` and `README.md` from build context.
- `.env.production` — `VITE_API_BASE_URL` cleared to empty string. Vite now bakes in an empty base URL, so axios makes relative `/bc/*` requests that nginx intercepts and proxies to the GCP API. This is the same pattern as the Vite dev proxy.
- `PRODUCT.md` — NEW. Required by the `/impeccable` skill. Documents register (product), users (RGMC field sales agents in Philippines), personality (warm, approachable, human), anti-references (SAP/Oracle enterprise look, flat icon-grid dashboards).
- `src/theme/variables.css` — Added `--ease-out-quart` and `--ease-out-expo` CSS custom properties to `:root`. Added three shared `@keyframes` (`fade-slide-up`, `fade-in`, `icon-pop`) in global scope. Added `@media (prefers-reduced-motion: reduce)` rule.
- `src/views/SplashPage.vue` — Logo entrance animation (scale 0.78→1, 0.65s expo); ring-pulse delayed to start after entrance. App name and steps stagger in. Done-state checkmark pops with `icon-pop`. Error block wrapped in `<Transition name="err-fade">`.
- `src/views/LoginPage.vue` — Logo block and card staggered entrance (expo curve). Error message wrapped in `<Transition name="err-fade">` (slides down from above). Sign In button scales to 0.97 on press.
- `src/views/LandingPage.vue` — Welcome strip fades in. Start button slides up with delay, scales on press. Draft list and customer list items stagger in at 30ms intervals (up to 4 and 8 items respectively).
- `src/views/ScanningPage.vue` — Item detail fields (`v-if="form.itemId"`) changed from `<template>` to `<div>` wrapped in `<Transition name="form-fields">` — reveals with fade + slide when item is selected. Submit bar wrapped in `<Transition name="submit-bar">` — slides up from bottom on appearance. Customer tap area and action buttons get press-scale feedback.
- `src/views/SubmitPage.vue` — Info card, both section blocks, and finalize wrap stagger in. All four status badge divs (`salesStatus === 'done'/'failed'`, `returnsStatus === 'done'/'failed'`) wrapped in `<Transition name="status-in">` — scale + fade on enter.
- `src/views/HistoryPage.vue` — `ion-list` gets `:key="activeFilter"` to force remount on filter switch (replaying stagger). Session list items stagger at 30ms intervals. Empty state fades in. Filter chips get smooth color transition.

---

## Failed Attempts

- **What was tried**: Dockerfile `CMD envsubst '$PORT' < template > config && nginx -g 'daemon off;'` with backslash line continuation — **Why it failed**: Shell quoting of `'$PORT'` was unreliable in Alpine's busybox sh with the inline CMD approach; nginx started as a child of sh rather than PID 1. Fixed with `docker-entrypoint.sh` using `set -e` + `exec nginx`.

- **What was tried**: `location ~* \.[0-9a-f]{8}\.(js|css|woff2?|png|svg|ico)$` (unquoted regex in nginx.conf) — **Why it failed**: nginx treats `{` in an unquoted location argument as the start of the block body. nginx parsed `\.[0-9a-f]{` as the URI, then `8}\.(js|css|woff2?|png|svg|ico)$` as a directive inside the block, throwing `unknown directive "8}\.(js|css|woff2?|png|svg|ico)$"`. Fixed by wrapping the regex in double quotes.

- **What was tried**: Setting `VITE_API_BASE_URL=https://rgmc-gcp-api-935246372408.asia-southeast1.run.app` in `.env.production` so the frontend calls the GCP API directly — **Why it failed**: Browser CORS policy blocked all requests from `https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app` to `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app` because the GCP API doesn't include `Access-Control-Allow-Origin` headers for the frontend's origin. Fixed by clearing `VITE_API_BASE_URL` and adding nginx `proxy_pass` so all `/bc/*` traffic is proxied server-side.

- **What was tried**: Adding `--ease-out-quart`/`--ease-out-expo` CSS custom properties by inserting them directly before `/* Global typography */` in `variables.css` — **Why it failed**: That location is outside the `:root {}` block; CSS custom properties must be declared inside a selector. The edit created invalid CSS with bare property declarations at global scope and a stray `}`. Fixed with two corrective edits: removing the malformed block, then inserting the vars inside the `--app-radius-sm` section of `:root {}`.

---

## Next Step

**Rebuild the Docker image and redeploy to Cloud Run.** The CORS fix (nginx proxy) requires a new image. Run:

```bash
docker build -t gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp .
docker push gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp
gcloud run deploy rgmc-consignment-webapp \
  --image gcr.io/durable-woods-465907-n1/rgmc-consignment-webapp \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated
```

After deploy, open the Cloud Run URL and verify: splash screen loads and both "Loading company data" and "Loading user directory" steps turn green. If they fail, check Cloud Run logs — `nginx -t` output will now appear there, making config errors immediately visible.

---

## Context & Gotchas

### Cloud Run details
- **Project ID**: `durable-woods-465907-n1`
- **Service name**: `rgmc-consignment-webapp`
- **Region**: `asia-southeast1`
- **GCP API upstream**: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`

### nginx.conf is a TEMPLATE, not a final config
`nginx.conf` contains `${PORT}` (literal, not substituted). It is copied to `/etc/nginx/nginx.conf.template` in the Docker image. At container startup, `docker-entrypoint.sh` runs `envsubst '$PORT'` to produce the real `/etc/nginx/nginx.conf`. Never run `nginx` directly against this template — it will fail on `listen ${PORT};`.

The `envsubst '$PORT'` (single-quoted) is intentional: it tells envsubst to substitute ONLY `$PORT`, leaving nginx's own `$uri`, `$remote_addr`, `$proxy_add_x_forwarded_for` etc. untouched.

### VITE_API_BASE_URL is baked at BUILD time
It is not a runtime environment variable. Vite bakes `import.meta.env.VITE_API_BASE_URL` into the JS bundle during `npm run build`. The `.env.production` file is now empty for this var — any Docker build that runs `npm run build` will produce a bundle that makes relative `/bc/*` requests. Do NOT set `VITE_API_BASE_URL` as a Cloud Run runtime env var — it has no effect on the running container.

### Auth guard race condition (by design)
`router.beforeEach` in `src/main.ts` fires before `authStore.loadFromStorage()` (which runs inside `router.isReady().then()`). Direct URL navigation to `/app/*` always redirects to `/splash`, which loads auth from localStorage and redirects to `/app/home`. This is intentional — splash is the auth hydration point. Do not move `loadFromStorage()` before the guard.

### ScanningPage: `<template>` changed to `<div>` for animations
The `<template v-if="form.itemId">` block in `ScanningPage.vue` was changed to `<Transition name="form-fields"><div v-if="form.itemId" class="form-fields-group">`. This `div` wrapper is transparent to layout (it's inside `ion-card-content` flex column) but changes the DOM structure. If you see layout regressions in the item form, check this wrapper first.

### Capacitor not yet initialized
`@capacitor/cli` and `@capacitor/core` are in `package.json` but `npx cap add android` / `npx cap add ios` has never been run. No `android/` or `ios/` directories exist. Mobile native build is not yet set up.

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand: Brand, user: Contact }` |
| `rgmc_cache_brands/contacts/customers/items/item_categories` | Synced BC data |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISOString }` |
| `rgmc_drafts` | `ScanSession[]` with `status: 'draft'` |
| `rgmc_sessions` | `ScanSession[]` with `status: 'submitted' \| 'failed'` |

### OrderLine type (common bug source)
`OrderLine` has `itemName` (not `itemDisplayName`) and has NO `itemCategoryCode` field. This bit us once — if you add any new code referencing order line fields, check `src/types/index.ts` first.

### screenshots/ directory
Contains 11 PNGs (01-splash through 11-history-desktop) generated by `screenshot-tour.js` using Playwright. The README references them at relative paths. To regenerate: `npm run dev` in one terminal, then `node screenshot-tour.js` in another.
