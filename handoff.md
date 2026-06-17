# Handoff

## Goal
Maintain and extend the RGMC Consignment Web App — an Ionic/Vue 3 PWA used by field sales agents to scan items and submit sales/return orders to Business Central via a GCP API gateway. The app runs offline-capable and is deployed to GCP Cloud Run.

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
