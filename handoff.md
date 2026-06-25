# Handoff

## Goal

Three separate tasks were in progress across two repos — `C:\claude\rgmc-consignment-webapp` (Ionic/Vue) and `C:\claude\rgmc-gateway` (Flask/Python admin portal):

1. **Fix the Report-a-Bug link** — The "Report a Bug" button in the consignment app opens the gateway's `/report-issue` page. It was returning `ERR_CERT_COMMON_NAME_INVALID`. The root cause identified: the hardcoded URL had a malformed region (`asiasoutheast1` instead of `asia-southeast1`). A fix was applied but the user confirmed the error **still persists**, meaning the actual deployed gateway URL is unknown and needs to be confirmed from GCP Cloud Run.

2. **Auto-incrementing build version** — ✅ Complete. Every `vite build` now stamps the app with `v{version} · build {commitCount}`. Displayed at the bottom of the Profile modal.

3. **Brands & Brand Prompts config screen** — ❌ Not started. User wants:
   - Two new Supabase tables: `brands` (brand_id uuid PK, brand_code text UNIQUE, brand_name text, brand_desc text) and `brand_prompts` (id uuid PK, brand_id uuid FK → brands, brand_prompt text, is_active boolean, created_at timestamptz)
   - New "Brands" and "Brand Prompts" sub-tabs inside the existing Configurations panel of the gateway admin (`/admin`) — full CRUD with a brands dropdown on the prompt form
   - Supabase project: `https://eesrzpgmsrbhjeenfojq.supabase.co` (same project already used by the gateway)

---

## Current State

### Task 1 — Report-a-Bug URL (partial / still broken)
- `useErrorReporter.ts` now reads `VITE_GATEWAY_URL` env var with a corrected fallback. Both `.env` and `.env.production` were updated.
- **Still broken**: User confirmed `ERR_CERT_COMMON_NAME_INVALID` persists after the fix. The actual deployed gateway URL has not been confirmed. There is no `.env` in `C:\claude\rgmc-gateway` (only `.env.example`), so the deployed URL is unknown locally.

### Task 2 — Build version ✅ Complete
All changes are in the consignment webapp and working.

### Task 3 — Brands config screen ❌ Not started
All relevant gateway files were read for planning. No code written. An attempted first write (SQL migration file) was rejected/interrupted by the user before it was created.

---

## Files Actively Being Edited

### `C:\claude\rgmc-consignment-webapp`

- `src/composables/useErrorReporter.ts` — `REPORT_BASE` changed to env-var driven: `${import.meta.env.VITE_GATEWAY_URL ?? 'https://rgmc-gateway-935246372408.asia-southeast1.run.app'}/report-issue`. Done but URL may still be wrong.
- `.env` — Added `VITE_GATEWAY_URL=https://rgmc-gateway-935246372408.asia-southeast1.run.app`. May need updating once correct URL is confirmed.
- `.env.production` — Same `VITE_GATEWAY_URL` addition.
- `src/env.d.ts` — Added `declare const __APP_BUILD__: string;` at line 4. Done.
- `vite.config.ts` — Added `import { execSync }`, `getBuildNumber()` function, and `__APP_BUILD__` in `define`. Done.
- `src/components/ProfileModal.vue` — Added "App" section (lines 152–157) with version/build display, added `appVersion`/`appBuild` constants in `<script setup>`, added `.app-version-block` styles. Done.

### `C:\claude\rgmc-gateway`

No files have been modified. All reading was planning only.

---

## Failed Attempts

- **What was tried**: Assumed gateway URL typo was `asiasoutheast1` → fixed to `asia-southeast1`. — **Why it failed**: User confirmed `ERR_CERT_COMMON_NAME_INVALID` still occurs. Root cause not fully resolved — the gateway may be on a custom domain or a completely different URL.

- **What was tried**: Creating `C:\claude\rgmc-gateway\migrations\add_brands.sql` as first step for Task 3. — **Why it failed**: User interrupted/rejected the file write. Preference appears to be providing SQL as a code block for manual execution in Supabase SQL Editor, not storing it as a project file.

---

## Next Step

**Resolve the gateway URL.** Ask the user to run:
```
gcloud run services describe rgmc-gateway --region asia-southeast1 --format "value(status.url)"
```
Or check GCP → Cloud Run → rgmc-gateway → Domain Mappings. Once the real URL is known, update `VITE_GATEWAY_URL` in both `.env` and `.env.production`.

**Then implement Task 3 (Brands config screen).** Full plan:

1. **SQL** — Provide as code block for Supabase SQL Editor:
   ```sql
   CREATE TABLE IF NOT EXISTS brands (
     brand_id   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
     brand_code text         NOT NULL UNIQUE,
     brand_name text         NOT NULL,
     brand_desc text
   );
   CREATE TABLE IF NOT EXISTS brand_prompts (
     id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
     brand_id     uuid        NOT NULL REFERENCES brands(brand_id) ON DELETE CASCADE,
     brand_prompt text        NOT NULL,
     is_active    boolean     NOT NULL DEFAULT false,
     created_at   timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE brands        ENABLE ROW LEVEL SECURITY;
   ALTER TABLE brand_prompts ENABLE ROW LEVEL SECURITY;
   ```

2. **`controllers/public.py`** — Add public `GET /api/brands` returning `brand_id, brand_code, brand_name` ordered by `brand_name`.

3. **`controllers/admin.py`** — Add admin-guarded endpoints:
   - `GET/POST /api/admin/config/brands`
   - `PATCH/DELETE /api/admin/config/brands/<brand_id>`
   - `GET/POST /api/admin/config/brand-prompts`
   - `PATCH/DELETE /api/admin/config/brand-prompts/<prompt_id>` — PATCH activating a prompt must deactivate all others for same `brand_id` first

4. **`templates/admin.html`** — Add two sub-tab buttons (`data-ctab="brands"` and `data-ctab="brand-prompts"`) to `#configSubTabs`, two config sub-panels (`#config-panel-brands`, `#config-panel-brand-prompts`), and two modals (`#cfgBrandModal` with code/name/desc fields, `#cfgBrandPromptModal` with brand dropdown + prompt textarea + is_active toggle).

5. **`static/admin.js`** — Add state vars (`_cfgBrandsCache`, `_cfgBrandPromptsCache`, `_cfgBrandEditId`, `_cfgBrandPromptEditId`), update `_loadCurrentConfigSub()` and Escape key handler, add full CRUD functions following the exact patterns of the existing NSI/Companies config sections.

---

## Context & Gotchas

- **Two repos**: `C:\claude\rgmc-consignment-webapp` (Ionic/Vue scanning app) and `C:\claude\rgmc-gateway` (Flask admin portal). Task 3 is entirely in the gateway.

- **Gateway admin auth**: All `/api/admin/*` endpoints must call `_require_admin()` from `services/guards.py`. Public endpoints like `/api/brands` do NOT need it.

- **Supabase service key bypasses RLS**: All gateway DB calls use `SUPABASE_SERVICE_KEY`. No permissive RLS policies needed — enabling RLS is sufficient for the tables.

- **`brand_prompts` PK is `id`, not `brand_id`**: `brand_id` is the FK column. The PATCH/DELETE endpoint path param is `prompt_id` mapped to `id`.

- **Only one active prompt per brand**: When activating a prompt, first PATCH all other `brand_prompts` rows with the same `brand_id` to `is_active=false`, then set the target to `is_active=true`.

- **Config sub-tabs use `data-ctab`** (not `data-tab`). Panels use id `config-panel-{ctab}`. `switchConfigTab()` and `.config-sub-panel` class drive visibility. New tabs must match exactly.

- **Shared modal helpers** `_resetCfgModal`, `_setCfgLoading`, `_showCfgError` take a prefix string (e.g. `'cfgBrand'`) and look up DOM elements by id like `cfgBrandFormActions`, `cfgBrandFormLoading`, `cfgBrandFormError`, `cfgBrandErrorMsg`. New modals must have those exact element ids.

- **ERR_CERT_COMMON_NAME_INVALID** means TLS cert hostname mismatch — not an expired cert. Cloud Run default `*.run.app` URLs have valid Google certs. If error persists with corrected region format, the gateway likely has a custom domain configured in Cloud Run with a missing or misconfigured SSL certificate. Check GCP → Cloud Run → rgmc-gateway → Domain Mappings tab.

This session had two tracks:
1. **Theme color consistency** — ensure all UI elements adapt correctly across the three themes: `light` (default branded dark-header style), `dark` (full dark mode), and `minimalist` (all-white, low-contrast). The user reported the username on the home page was showing as white on white in minimalist mode.
2. **IT/MIS bug reporting** — add a "Report a Bug" button to all page headers and a "Report to IT/MIS" button on all API error surfaces (400/500 errors in Submit page and History page detail modal). Also add a first-deployment tooltip on the bug button.

Both tracks are complete. The build passes (`vite build` and `vue-tsc --noEmit` both clean).

---

## Current State

**Everything is working and the build is clean.**

- `vue-tsc --noEmit` → no errors
- `vite build` → succeeds in ~5s, outputs `dist/` with PWA service worker
- Both feature tracks are fully implemented and integrated

### Theme fixes (complete)
- `LandingPage.vue` — `.welcome-name` (username) and `.welcome-label` now correctly show dark text in minimalist mode via `.lp--minimalist` class overrides
- `ScanningPage.vue` — `.submit-bar` and `.submit-bar__count` now adapt in minimalist via `.scanning--minimalist` (class was already applied; just added CSS)
- `HistoryPage.vue` — `.grand-total-row` and `.grand-total-label` adapt in minimalist via `.history--minimalist` class
- `LoginPage.vue` — `.login-title` adapts in minimalist via `.login--minimalist` class

### Bug reporting (complete)
- `src/version.ts` (NEW) — exports `APP_VERSION = '1.2.0'`; bump on each deployment to trigger tooltip
- `src/composables/useErrorReporter.ts` (NEW) — `openReport({ error, context })` builds URL with user/brand/company/HTTP status/endpoint/UA and opens `https://rgmc-gateway-935246372408.asiasoutheast1.run.app/report-issue?system=rgmc-consignment-app&error=<encoded>`
- `src/components/BugReportButton.vue` (NEW) — header icon button with pulsing red dot + slide-down tooltip on first login after new deployment; auto-dismisses in 9s
- `src/services/api.service.ts` — new `ApiError` class preserving `.status`, `.endpoint`, `.method`; interceptor now throws `ApiError` instead of plain `Error`
- `src/views/SubmitPage.vue` — "Report to IT/MIS" button in both sales and returns error blocks; `BugReportButton` in header
- `src/views/HistoryPage.vue` — "Report to IT/MIS" button in failed session detail modal error block; `BugReportButton` in header
- `src/views/LandingPage.vue` — `BugReportButton` in header
- `src/views/ScanningPage.vue` — `BugReportButton` in header

---

## Files Actively Being Edited

All edits are complete and saved. No file is in a partial/mid-edit state.

- `src/version.ts` — NEW. Single export `APP_VERSION`. Must be bumped manually on each GCP deployment.
- `src/composables/useErrorReporter.ts` — NEW. Composable that builds the IT/MIS report URL with rich context.
- `src/components/BugReportButton.vue` — NEW. Self-contained header button with deployment tooltip logic. Tooltip tracks version via `localStorage.getItem('rgmc_seen_version')`.
- `src/services/api.service.ts` — Added `ApiError` class at top of file (before the `import type` block). Updated response error interceptor to use `ApiError` instead of `new Error`.
- `src/views/LandingPage.vue` — Added `lp--minimalist` class on `<ion-page>`, `isMinimalist` computed, minimalist scoped CSS overrides for welcome hero/label/name/date-row/draft-avatar. Added `BugReportButton` import + `<bug-report-button />` in `slot="end"`.
- `src/views/ScanningPage.vue` — Added `.scanning--minimalist .submit-bar` and `.scanning--minimalist .submit-bar__count` CSS. Added `BugReportButton` import + `<bug-report-button />` in `slot="end"`.
- `src/views/HistoryPage.vue` — Added `history--minimalist` class on `<ion-page>`, `isMinimalist` computed, minimalist overrides for `.grand-total-row`/`.grand-total-label`. Added `bugOutline` to ionicons imports, `BugReportButton` + `useErrorReporter` imports, `reportSessionError()` function, "Report to IT/MIS" button in `.error-block` of detail modal. CSS additions for `.error-block-body`, `.error-block-fallback`, `.report-btn`. Added `BugReportButton` to header.
- `src/views/LoginPage.vue` — Added `login--minimalist` class on `<ion-page>`, `isMinimalist` computed, scoped CSS overrides for `.login-title`, `.login-card` shadow, `.brand-family-tag`.
- `src/views/SubmitPage.vue` — Added `bugOutline` to ionicons imports, `BugReportButton` + `useErrorReporter` imports, `salesErrorObj`/`returnsErrorObj` refs, `reportSalesError()`/`reportReturnsError()` functions. Updated catch blocks to store error objects. Added "Report to IT/MIS" buttons in both error blocks. Added `.fail-body`/`.fail-actions` CSS. Added `<bug-report-button />` in header `slot="end"`.

---

## Failed Attempts

- **What was tried**: Using `v-bind(TIP_DURATION + 'ms')` inside a `@keyframes` rule in `BugReportButton.vue` — **Why it failed**: `v-bind()` in `<style scoped>` works for CSS property values but not as a keyframe animation duration string in that syntax. Fixed by hardcoding `9s` in both the `animation:` property and the matching `@keyframes brb-countdown` rule.

No other failed attempts. All other changes compiled and ran cleanly on first try.

---

## Next Step

**There is no pending work from this session.** The build is clean.

The most likely next actions depending on what the user wants:
1. **Deploy to GCP** — run the standard GCP Cloud Run deploy. After deploying, bump `APP_VERSION` in `src/version.ts` (e.g., `'1.2.0'` -> `'1.3.0'`) so existing users see the bug report tooltip on their next login.
2. **Test the report URL** — verify the IT/MIS gateway at `https://rgmc-gateway-935246372408.asiasoutheast1.run.app/report-issue` actually accepts the `?system=` and `?error=` parameters and routes them correctly.
3. **Test minimalist theme on device** — manually switch to minimalist in the ProfileMenu popover and verify the welcome hero name, submit bar, grand total row, and login title all render with dark text.

---

## Context & Gotchas

### Theme system
- Three themes: `'minimalist' | 'light' | 'dark'` stored in `localStorage` under key `rgmc_theme_v2`.
- Default is `'minimalist'` (set in `useTheme.ts` `getStored()` fallback).
- Theme applied as `data-theme="minimalist"` attribute on `document.documentElement`.
- **Key CSS token**: `--app-dark: #ffffff` in `[data-theme="minimalist"]` — this is what causes `var(--app-dark)` callers (welcome hero, submit bar, grand total row) to become white in minimalist, which then requires text overrides in each component.
- Per-component minimalist overrides use a class (e.g., `.lp--minimalist`) on `<ion-page>` driven by `isMinimalist = computed(() => theme.value === 'minimalist')`. This is necessary because Vue scoped CSS can't directly select `[data-theme="minimalist"]` on `<html>`.
- Theme toggle is in `ProfileMenu.vue` popover (three pills: Minimal / Light / Dark). It was moved here in a previous session — there are no other theme toggles anywhere.

### Bug reporting
- `APP_VERSION` in `src/version.ts` must be bumped manually before each GCP deployment for the tooltip to fire. There is no automated version injection.
- The tooltip is tracked per-device in `localStorage` under key `'rgmc_seen_version'`. If the stored value matches `APP_VERSION`, no tooltip fires.
- The report URL uses `window.open(..., '_blank')` — on mobile (Capacitor/PWA), this opens in an in-app browser or system browser depending on the platform config.
- `ApiError` (in `api.service.ts`) is a class, not an interface. Components can use `instanceof ApiError` to extract `.status`, `.endpoint`, `.method`. `useErrorReporter` already does this internally.

### Build / deployment
- Vite `publicDir` is `public/` — static assets (logos, icons) must be in `public/static/`, NOT the project-root `static/` folder. A prior session fixed the GCP logo-not-showing bug by copying all four logo files (`cons-logo.png`, `cons-logo-splash.png`, `logo.png`, `logo-bnw.png`) into `public/static/`.
- `vue-tsc --noEmit` (not plain `tsc --noEmit`) is required for type-checking Vue SFCs.
- The chunk size warning about `index-*.js > 500kB` is pre-existing and not introduced by this session. It is not a build failure.

### Reporting URL
The full base URL for IT/MIS reporting is:
```
https://rgmc-gateway-935246372408.asiasoutheast1.run.app/report-issue
```
Parameters appended by `useErrorReporter`:
- `system=rgmc-consignment-app` (always)
- `error=<URL-encoded multiline string>` (contains timestamp, user, brand, company, HTTP status, request method+endpoint, error message, page path, user-agent snippet)
