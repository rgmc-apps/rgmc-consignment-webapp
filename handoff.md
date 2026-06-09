# Handoff

## Goal
Build and maintain the RGMC Consignment Web App — an Ionic/Vue PWA used by sales agents to scan items and submit sales orders and return orders to Business Central via a FastAPI GCP backend. The app handles item scanning, customer selection, order review/submission, and session history.

Current completed features:
- `submittedBy` field on every sales/return order (frontend → GCP API → BC via custom Pag50216/50217)
- Brand tag access control at login: contacts are checked against `bc/custom/contacts/<id>/brand-tags` before being allowed in

## Current State

### Frontend (`C:\claude\rgmc-consignment-webapp`) — ⚠️ ONE UNCOMMITTED CHANGE
- Latest committed: `6978a03` "added brand tag checking" — includes:
  - `LoginPage.vue`: `loadBrands()` now fetches brands + item families in parallel and enriches each brand with `itemFamilyCode` (matches by `family.description === brand.displayName`)
  - `auth.store.ts`: `checkBrandAccess` uses `brand.itemFamilyCode ?? brand.code` instead of `brand.code` alone
- **UNCOMMITTED**: `src/stores/auth.store.ts` has one pending change — empty brand tags now blocks login with: `"No brand access has been configured for your account. Please contact head office for configuration."` (previously returned `true` = fail-open)

### GCP API (`C:\RGMC\Source\git\rgmc-gcp-api`) — ✅ CLEAN
- Latest commit: `2b955f6` "added sales order routes" — includes `rgmc_sales_order_models.py` (previously untracked)
- All brand tag endpoints exist: `GET/POST/DELETE /bc/custom/contacts/{id}/brand-tags`
- GCP API has **NOT been redeployed to Cloud Run** — several commits behind last deploy

### AL Project (`C:\RGMC\AL\RGMC_AL_v2`) — ✅ CLEAN, deployment status unknown
- Latest relevant commit: `b3b72a9` "added fix for the brand tag list" — includes a built `.app` file (`RGMC Publisher_RGMC Glenn Eregia_1.0.1.10.app`)
- Pag50209 (`RGMC Contact Brand Tag API`) is implemented and exposes `id`, `contactNo`, `brandCode`, `description`
- `"Submitted By"` field on Sales Header (tableextension 50211) and custom API pages (Pag50216, Pag50217) are committed
- Unknown if the `.app` has been published/deployed to Business Central

## Files Actively Being Edited

- `src/stores/auth.store.ts` — **UNCOMMITTED**: empty brand tags prompt (lines 62-73, `checkBrandAccess`). Change: replaced `if (tags.length === 0) return true;` with a block that sets `error.value` and returns `false`.

## Failed Attempts
- **What was tried**: Using `brand.code` (dimension value code) in `checkBrandAccess` to match against brand tags — **Why it failed**: Brand tags store LSC Item Family codes (Pag50209 `"Brand Code"` field has `TableRelation = "LSC Item Family".Code`), not dimension value codes. User confirmed the codes match in their BC setup but switched to `itemFamilyCode` anyway for correctness.
- **What was tried**: `brand.itemFamilyCode` was available at login without enrichment — **Why it failed**: LoginPage's `loadBrands()` called only `ApiService.getBrands()` (raw dimension values, no `itemFamilyCode`). Fixed by fetching item families in parallel and enriching in `loadBrands()`.

## Next Step
**Commit the pending auth.store.ts change:**

```
cd C:\claude\rgmc-consignment-webapp
git add src/stores/auth.store.ts
git commit -m "block login when contact has no brand tags configured"
git push
```

Then decide on deployment order:
1. **GCP API → Cloud Run** (project `durable-woods-465907-n1`, region `asia-southeast1`) — needed for brand tag checking to hit real BC data
2. **AL extension → Business Central** — if not yet deployed, `submittedBy` and Pag50216/50217/50209 don't exist in BC

## Context & Gotchas
- **`checkBrandAccess` fail-open on network error** (`catch → return true`): If the brand tags endpoint is unreachable (offline, BC down), the login succeeds. This is intentional.
- **`itemFamilyCode` enrichment at login**: `loadBrands()` in `LoginPage.vue` now calls both `getBrands()` and `getItemFamilies()` in parallel. If item families fail to load, `brands.value = []` and the brand dropdown will be empty — user can't log in until brands load successfully.
- **Brand tag comparison**: `brand.itemFamilyCode ?? brand.code` — falls back to dimension value code only if item family enrichment missed the brand (no matching description). User confirmed codes are the same in their BC setup so either works, but `itemFamilyCode` is the canonical source.
- **AL `Submitted By` field**: Not in BC until the AL extension is deployed. Until then, write operations with `submittedBy` may silently fail or be ignored by BC.
- **AL ID range**: 50100–50217 used. Next available: 50218.
- **Sales Return Orders list page** (pageextension 50215) is intentionally empty — `Control1` sources `Sales Line`, not `Sales Header`, so `"Submitted By"` can't be added there. The field is visible on the card (50214) instead.
- **GCP API Cloud Run**: 5 commits have been pushed since last deploy (`2b955f6`, `f77ecca`, `054f489`, `8e50a2e`, `01e5b7c`). Must redeploy before brand tag checking and `submittedBy` work in production.
- **`displayName` on items**: Pag50205 returns `description` for the item name. `getItems()` in `api.service.ts` maps `description → displayName` as fallback.
