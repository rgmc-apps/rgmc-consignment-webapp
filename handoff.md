# Handoff

## Goal

Ship and maintain the **RGMC Consignment Web App** on Google Cloud Run — a mobile-first Ionic/Vue 3 scanning tool for Philippines sales agents to build sales/return orders against a GCP-hosted Business Central API.

**Acceptance criteria (all met as of this session):**
- ✅ Login pre-syncs ALL data automatically (customers, items, categories, brands, contacts)
- ✅ ScanningPage shows items after sync (no manual re-tap needed)
- ✅ Barcode/item scan → confirm sheet with qty stepper, discount, grand total
- ✅ Multi-barcode picker: Code 128 prioritised first, user picks when multiple detected
- ✅ Single barcode confirm panel with beep + haptic before resolving
- ✅ Offline mode (OFFLINE badge, scan works if items loaded, SubmitPage disabled offline)
- ✅ Pull-to-refresh on ScanningPage, LandingPage, HistoryPage
- ✅ No `QuotaExceededError` in localStorage (items in `_itemsMemory` + IndexedDB)
- ✅ All screens work against live GCP API via nginx proxy
- ✅ "Save as Draft & Go Back" saves as `draft` status (not `submitted`)
- ✅ Drafts without a customer are NOT saved or shown on Home
- ✅ Drafts with order lines have a Submit shortcut button on the Home page
- ✅ App is full-screen on desktop; content centred in a 720 px column
- ✅ Stale-chunk errors on deploy fixed (nginx no-cache + router error handler)
- ✅ Order date field on ScanningPage (saved locally, sent to API)
- ✅ Version `v1.0.0` displayed in sync bar next to date
- ✅ Sales return order endpoint fixed (`/bc/custom/sales-return-orders`)
- ✅ Items persisted to IndexedDB — offline scanning survives browser refresh
- ✅ Full offline navigation — SplashPage bypasses network if auth + cache exist
- ✅ Submit buttons disabled + inline notice when offline
- ✅ "Save as Draft" icon in ScanningPage header (when customer selected)
- ✅ PWA Service Worker — app loads from SW cache with no internet
- ✅ Offline toast — device going offline shows a dismissible notification
- ✅ Dark/light mode toggle — persistent, no flash-of-wrong-theme, all surfaces adapt
- ✅ Design overhaul — Outfit font, semantic type scale, initials avatars, welcome hero
- ✅ `@property` gold accent system — 3 animated moments wired to meaningful events

---

## Current State

**All changes committed and pushed. Latest commit: `c23d3b0 design improvements`.**
Both local `HEAD` and `origin/master` are at `c23d3b0`.
TypeScript: zero errors (`npx vue-tsc --noEmit` exits clean).
Working tree: clean (no uncommitted changes).

Cloud Build will have triggered on the push. Verify deployment at:
`https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app`

### What was built this session (all in `c23d3b0`):

**1. Offline toast** (`src/App.vue`):
- `watch(isOnline)` on `true→false` transition shows a styled toast (dark bg, gold top border, "You're now offline" + sub-message)
- CSS classes `offline-toast` and `offline-toast-body` defined in `variables.css`
- Toast does NOT fire on online restore (that triggers the gold pulse instead)

**2. Dark/Light mode toggle** (`src/composables/useTheme.ts`, all page headers):
- Module-level singleton `isDark` ref — shared across all components
- `data-theme="dark"` applied to `document.documentElement` at module load (prevents flash-of-wrong-theme on return visits)
- Persisted to `localStorage` under key `rgmc_theme`
- Dark mode CSS vars override in `variables.css` under `[data-theme="dark"]` selector
- Toggle button with animated icon swap (`.theme-toggle-icon` keyframe) added to ScanningPage, HistoryPage, LandingPage headers

**3. Design overhaul** (multi-file):
- Google Fonts: Outfit (300–800) loaded in `index.html` via preconnect + stylesheet link
- `viewport` meta: removed `user-scalable=no, minimum-scale=1.0, maximum-scale=1.0` (WCAG 1.4.4 fix)
- Semantic type scale in `rem` (not `px`): `--text-2xs` through `--text-hero` in `variables.css`
- Proportional letter-spacing tokens in `em`: `--tracking-tighter` through `--tracking-wider`
- Line-height tokens: `--leading-tight` through `--leading-relaxed`
- Shadow tokens: `--app-shadow-xs`, `--app-shadow`, `--app-shadow-md`, `--app-shadow-gold`
- Radius tokens: `--app-radius-sm` through `--app-radius-xl`
- `--app-fg` semantic foreground token (flips light/dark) replacing `--app-dark` on text
- Semantic utility tokens: `--app-danger-bg`, `--app-warn-bg`, `--app-warn-text`, `--app-error-border`
- Initials avatars replacing `ion-icon` in draft/customer lists (`LandingPage.vue`)
- Welcome hero strip (dark editorial band with radial gold glow + gold separator line)
- Global tabular-nums utility on all monetary/numeric classes
- Side-stripe ban enforced: no `border-left > 1px` colored accents anywhere

**4. `@property` gold accent system** (`src/composables/useGoldAccent.ts`, `variables.css`, 3 pages):
- Three `@property`-registered animatable custom properties: `--gold-hdr-glow`, `--gold-submit-glow`, `--gold-sweep-alpha`
- **Trigger 1 — online restore** (`App.vue`): `isOnline` false→true calls `triggerHeaderPulse()`. `ion-header.gold-online-pulse` runs `gold-hdr-pulse` (1.8s) — downward `box-shadow` using `oklch(... / var(--gold-hdr-glow))` driven by the `@property`-animated number
- **Trigger 2 — item added** (`ScanningPage.vue`): `triggerSubmitFlash()` called after `doConfirm()`, `addToSales()`, `addToReturn()`. `.submit-bar.gold-item-flash` runs `gold-submit-flash` (1s) — upward `box-shadow` burst
- **Trigger 3 — submission success** (`SubmitPage.vue`): `triggerSweep()` called when `salesStatus` or `returnsStatus` hits `'done'`. `v-if="sweepActive"` mounts `.gold-sweep-overlay` (fixed, z-9999, pointer-events-none) — radial-gradient using `var(--gold-sweep-alpha)` sweeps from center and expands
- Double-rAF pattern in each trigger ensures class removal + re-add restarts CSS animations cleanly
- Degrades silently in Chrome < 85 / Safari < 16.4 (no `@property` support → animation no-ops)
- Already covered by the global `prefers-reduced-motion` rule in `variables.css`

---

## Files Actively Being Edited

Nothing in flight — all clean.

### Files changed in `c23d3b0`:

- `index.html` — Outfit font (preconnect + stylesheet), WCAG viewport fix (removed `user-scalable=no`)
- `src/App.vue` — Offline toast watch; online-restore calls `triggerHeaderPulse()`; imports `useGoldAccent`
- `src/composables/useTheme.ts` — NEW: module-level `isDark` singleton, `data-theme` attribute management, `localStorage` persistence
- `src/composables/useGoldAccent.ts` — NEW: module-level refs for 3 animation states, 3 trigger functions with double-rAF + setTimeout cleanup
- `src/theme/variables.css` — Semantic token system (type scale, tracking, leading, shadows, radii, easings), dark mode overrides, offline toast styles, `@property` registrations + keyframes + 3 animation selectors (`.gold-online-pulse`, `.gold-item-flash`, `.gold-sweep-overlay`)
- `src/views/LandingPage.vue` — Initials avatars, welcome hero band (dark + radial glow), dark mode token fixes, toggle button in header
- `src/views/ScanningPage.vue` — Toggle button, `useTheme`/`useGoldAccent` imports, `ion-header :class="{ 'gold-online-pulse': headerPulseActive }"`, submit-bar `:class` binding, `triggerSubmitFlash()` calls in all 3 item-add paths, typography tokens throughout
- `src/views/HistoryPage.vue` — Toggle button, `useTheme` import, `--app-fg` text fixes, `--app-danger-bg` banner, `--app-surface-alt` detail content (was `--app-bg` which didn't exist), grand total tokens
- `src/views/SubmitPage.vue` — `useGoldAccent` import, `v-if="sweepActive"` overlay element, `triggerSweep()` in `doSubmitSales` and `doSubmitReturns` success paths
- `handoff.md` — Updated this file

---

## Failed Attempts

- **Side-stripe border on draft items**: Added `border-left: 3px solid rgba(255,196,9,0.55)` on `.draft-item` during design phase — caught and removed by impeccable laws ("border-left or border-right greater than 1px as a colored accent is banned"). Replaced with `--background: rgba(255,196,9,0.04)` tint.

- **`--app-bg` token in HistoryPage**: `.detail-content { --background: var(--app-bg) }` referenced a token that was never defined in `variables.css`. Replaced with `var(--app-surface-alt)`.

- **`--app-dark` for text colors**: `color: var(--app-dark)` was used for text throughout all pages. `--app-dark: #1a1a1a` is fixed (doesn't flip in dark mode), so text became invisible on dark backgrounds. Solution: new `--app-fg` token was introduced that flips between `#1a1a1a` (light) and `#edeae4` (dark). All text `color: var(--app-dark)` migrated to `color: var(--app-fg)` in ScanningPage (9 locations), HistoryPage (4 locations), SubmitPage. The `--app-dark` value is kept for permanently-dark surfaces (submit bar background, grand-total row).

- **`user-scalable=no` in viewport meta**: Was causing WCAG 1.4.4 violations (blocks browser pinch-zoom). Removed from `index.html`.

- **Bash heredoc for git commit on Windows**: `git commit -m "$(cat <<'EOF'...)"` syntax is bash-only and fails in PowerShell. Must use PowerShell here-string: `git commit -m @'...'@` with closing `'@` at column 0.

---

## Next Step

**Verify the live deployment looks correct.**

1. Visit `https://rgmc-consignment-webapp-a52bp7y4ea-as.a.run.app`
2. Check: Outfit font is loading, dark/light toggle works and persists on refresh
3. Simulate offline (DevTools → Network → Offline) → observe toast
4. Re-enable network → header should briefly glow gold
5. Add an item to an order → submit bar should flash gold
6. Submit an order → full-screen radial gold sweep should appear

If Cloud Build is still running (~5 min after the push), wait for it to complete first.

---

## Context & Gotchas

### Deployment
- **GitHub push → Cloud Build trigger → Cloud Run** (~5 min)
- Project: `durable-woods-465907-n1` | Service: `rgmc-consignment-webapp` | Region: `asia-southeast1`
- GCP API: `https://rgmc-gcp-api-935246372408.asia-southeast1.run.app`
- Dockerfile always runs `npm run build` — `dist/` is in `.gitignore`

### Dark mode — flash prevention
- `useTheme.ts` applies `data-theme` to `document.documentElement` at MODULE LOAD TIME (outside any function). This runs before any Vue component mounts, preventing the flash-of-wrong-theme for returning dark-mode users.
- The singleton `isDark` ref at module level means ALL components that call `useTheme()` share the same reactive ref — toggling in one header instantly updates all others.

### `--app-fg` vs `--app-dark` split
- `--app-dark: #1a1a1a` — permanently dark, never flips (used as background color for submit bar, grand-total row, header backgrounds)
- `--app-fg` — flips: `#1a1a1a` in light, `#edeae4` in dark (used for ALL text colors)
- Do not use `color: var(--app-dark)` for text. Always use `color: var(--app-fg)`.

### `@property` gold system — browser support
- `@property` is supported in Chrome 85+, Edge 85+, Firefox 128+, Safari 16.4+
- In unsupported browsers, the custom properties are treated as non-animatable strings → `box-shadow` and `background` remain at their `initial-value: 0` (transparent/invisible). Visual effects silently don't appear. Nothing breaks.
- The global `@media (prefers-reduced-motion: reduce)` rule in `variables.css` sets `animation-duration: 0.01ms !important` on `*` — this kills all three gold animations for accessibility users without any extra code.

### `@property` — where defined
- Must be in global CSS (not scoped component styles) to work. All three `@property` declarations are in `src/theme/variables.css` which is imported globally.
- `@keyframes` (also global) are in `variables.css`. The CSS selectors using those keyframes (`.gold-item-flash`, `ion-header.gold-online-pulse`, `.gold-sweep-overlay`) are also in `variables.css` — avoiding Vue scoped-style attribute complications.

### Gold accent timing
- `triggerHeaderPulse()`: class held for 2000ms (animation is 1.8s)
- `triggerSubmitFlash()`: class held for 1100ms (animation is 1s)
- `triggerSweep()`: class held for 1200ms, `v-if` mounts/unmounts the element (animation is 1.05s) — mounting ensures animation always starts from scratch (no stale fill state)

### Double-rAF pattern in `useGoldAccent.ts`
- `ref = false` then `requestAnimationFrame(() => requestAnimationFrame(() => { ref = true; ... }))` ensures the DOM processes the class removal BEFORE re-adding it, restarting the CSS animation properly. Required for rapid re-trigger (e.g., user adds two items quickly).

### `addToSales()` / `addToReturn()` — pre-existing bug (not fixed)
- `resetItemForm()` is called BEFORE `toast(form.itemName ...)`. After reset, `form.itemName = ''`, so the toast shows "Item added to Sales" instead of the actual item name. This is a pre-existing issue, out of scope. `triggerSubmitFlash()` is called after the toast, so it works regardless.

### Typography token system
- All sizes in `rem` (not `px`) so user browser zoom preferences are respected
- Tracking in `em` (proportional) so letter-spacing scales with font size
- `font-variant-numeric: tabular-nums` applied globally to all monetary/numeric display classes via a selector list in `variables.css` — do not revert to `letter-spacing: -0.5px` hacks
- `text-wrap: balance` applied to headings and key names to prevent orphan words on narrow screens

### PWA / Service Worker
- `vite-plugin-pwa` v1.3.0 installed as dev dep
- `generateSW` mode — Workbox auto-generates `sw.js` at build time
- `navigateFallback: '/index.html'` makes all SPA routes work offline
- `navigateFallbackDenylist: [/^\/bc\//]` — API calls bypass fallback
- SW only activates after the FIRST online visit; users need one online load before offline mode works

### API endpoints
- Sales orders: `POST /bc/sales-orders`
- Sales return orders: `POST /bc/custom/sales-return-orders` (note `custom/` prefix — was wrong before `baac605`)
- All read endpoints: `GET /bc/*`

### localStorage keys
| Key | Contents |
|---|---|
| `rgmc_auth` | `{ brand, user }` |
| `rgmc_theme` | `'dark'` or `'light'` |
| `rgmc_cache_brands` | Brand[] |
| `rgmc_cache_contacts` | Contact[] |
| `rgmc_cache_customers` | Slim `{id,number,displayName,city}[]` |
| `rgmc_cache_item_categories` | ItemCategory[] |
| `rgmc_sync_timestamps` | `{ customers, items, itemCategories: ISO }` |
| `rgmc_sessions` | ScanSession[] `status:'submitted'\|'failed'` |
| `rgmc_drafts` | ScanSession[] `status:'draft'` |
| ~~`rgmc_cache_items`~~ | **Removed** — items in `_itemsMemory` + IndexedDB |

### Items — IndexedDB persistence
- `_itemsMemory` (module-level JS var) is the in-session store — lost on tab refresh
- `StorageService.setCachedItems()` fire-and-forgets an IDB write to `rgmc-cache` DB, `items` object store, key `'all'`
- `StorageService.init()` reads from IDB → populates `_itemsMemory`. Must be called at startup. Idempotent.
- Called in: `App.vue` (root mount), `SplashPage.vue` (before cache check), `ScanningPage.vue` (before refreshCache)

### Offline navigation flow
- `main.ts` `router.beforeEach`: redirects unauthenticated users to `/splash`
- `router.isReady().then(...)` loads auth + session from localStorage BEFORE `app.mount()`
- `SplashPage.onMounted`: awaits `StorageService.init()`, checks auth + cache → skip network if both present

### Draft save guard
- `_saveDraft()` returns early if `currentSession.customer` is null (no ghost drafts)
- `LandingPage.visibleDrafts` filters customerless drafts as a safety net

### `OrderLine` type
- Has `itemName` (not `itemDisplayName`) and NO `itemCategoryCode`
- Check `src/types/index.ts` before referencing order line fields

### `VITE_API_BASE_URL` baked at build time
- Empty in `.env.production` — Axios makes relative `/bc/*` requests — nginx proxies to GCP API
- Runtime env var has no effect

### Version number
- Defined in `package.json → version`
- Injected at build time: `define: { __APP_VERSION__: JSON.stringify(version) }` in `vite.config.ts`
- Declared as `const __APP_VERSION__: string` in `src/env.d.ts`
- To bump: change `"version"` in `package.json` and push — no other code changes needed

### `ion-content::part(scroll)` — desktop centering
- In `variables.css`: `max-width: 720px; margin: auto` on the scroll part
- Overridden to `max-width: 100%` for viewports `< 600px` (phones stay full-width)
