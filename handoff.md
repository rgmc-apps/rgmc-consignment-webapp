# Handoff

## Goal

Build a fully working authentication system for the RGMC Consignment Web App (Ionic Vue 3 PWA), including:
- Login with username/password (plain-text, bcrypt, default password enforcement)
- First-time password setup modal
- Profile photo fetch and upload (from/to BC custom contacts API)
- User profile editing
- All state persisted offline-capable via localStorage + IndexedDB

This session focused on auth bugs, API field mismatches, and the contact photo feature.

---

## Current State

### Working ✓
- Login with plain-text password (fixed `isBcryptHash` regex bug)
- Login with bcrypt password
- Forced password change when stored hash equals `'12345678'`
- First-time password setup via `SetPasswordModal` navigates to home correctly
- BC PATCH endpoint now accepts `username` and `passwordHash` fields (added to Pydantic model)
- Contact field normalization: `name→displayName`, `phoneNo→phoneNumber`, `companyNo→companyNumber`, etc.
- `ion-select` dropdown + action-sheet colors adapt to light/dark mode
- `UserAvatar` component created and wired into `ProfileMenu` (small trigger + popover header)
- `ProfileModal` hero avatar replaced with `UserAvatar` + camera badge for photo upload
- Auth store `photoUrl` ref: persisted to localStorage, loaded on `loadFromStorage`, cleared on logout
- `ApiService.getContactPicture()` and `updateContactPicture()` wired up
- GCP API picture endpoints (`GET /bc/custom/contacts/{id}/picture`, `PATCH /bc/custom/contacts/{id}/picture`) implemented and updated by user to use BC AL page `contactPictures` via base64 JSON

### Untested / Unknown
- Photo fetch/display on login (fires in background via `fetchAndCachePhoto()` — needs live test with deployed GCP API)
- Photo upload from `ProfileModal` — needs live test
- `passwordHash` PATCH to BC (GCP API model now includes the field — needs confirmation it round-trips through BC AL page)

### GCP API not yet redeployed
Changes to `C:\RGMC\Source\git\rgmc-gcp-api` are local only. The live Cloud Run service has not been redeployed with the picture endpoints or the `passwordHash`/`username` model additions.

---

## Files Actively Being Edited

### Frontend — `C:\claude\rgmc-consignment-webapp`

- `src/stores/auth.store.ts` — Added `photoUrl` ref, `setPhotoUrl()`, `fetchAndCachePhoto()` (fire-and-forget after login), `logout()` now clears photo. Fixed `isBcryptHash` to use regex instead of `bcrypt.getRounds()`.

- `src/services/api.service.ts` — Comprehensive field normalization in `getContacts()` (maps `name→displayName`, `phoneNo→phoneNumber`, etc.). Added `getContactPicture(id)` (returns base64 data URL) and `updateContactPicture(id, file)` (multipart upload).

- `src/services/storage.service.ts` — Added `AUTH_PHOTO` key, `getAuthPhoto()`, `setAuthPhoto()`, `clearAuthPhoto()` for caching the logged-in user's photo as a base64 data URL.

- `src/components/UserAvatar.vue` — **NEW FILE.** Reusable avatar: shows `<img>` if `src` prop is set (with `@error` fallback), otherwise shows name initial. Root `.ua-wrap` has `overflow: hidden` so parent's `border-radius: 50%` clips the image correctly.

- `src/components/ProfileModal.vue` — Hero avatar replaced with `UserAvatar` + `.hero-avatar-wrap` container + `.hero-avatar-badge` (gold camera icon, bottom-right). Added `photoInput` ref, `isUploadingPhoto` ref, `triggerPhotoUpload()`, `onPhotoSelected()`. Imports `ApiService`, `UserAvatar`, `cameraOutline`.

- `src/components/ProfileMenu.vue` — Both `.avatar-sm` (trigger) and `.pop-avatar` (popover header) replaced with `<user-avatar :src="authStore.photoUrl" :name="..." class="...">`. Removed unused `userInitial` computed.

- `src/components/SetPasswordModal.vue` — `sync()` is now fire-and-forget before `router.replace('/app/home')` so navigation is not blocked by the full data sync.

- `src/views/LoginPage.vue` — Added explicit `--color`, `--placeholder-color` CSS on `.login-field`, `ion-select`, `ion-input` so field text is visible in both light and dark modes.

- `src/theme/variables.css` — Added `ion-action-sheet` global overrides so the brand dropdown action-sheet adapts to `--app-surface`/`--app-fg` theme tokens.

### GCP API — `C:\RGMC\Source\git\rgmc-gcp-api`

- `src/routers/bc_routes/rgmc_contact_routes.py` — Added `GET /{contact_id}/picture` and `PATCH /{contact_id}/picture` endpoints. Updated by user to use BC AL page `contactPictures` (Pag50204) via base64 JSON field (`picture`), not binary content streaming. Removed dependency on `rgmc_get_contact_picture_content`.

- `src/services/bc_functions.py` — Updated by user: `rgmc_get_contact_picture` now fetches `contactPictures({contact_id})` returning `{id, contactNo, picture}` where `picture` is base64. `rgmc_update_contact_picture` now PATCHes `{"picture": picture_base64}` as JSON. Old multi-step binary approach removed.

- `src/models/bc_models/rgmc_contact_models.py` — Added `username: Optional[str]` and `passwordHash: Optional[str]` to `RgmcContactCreate` (inherited by `RgmcContactUpdate`). These were missing, causing all password PATCH attempts to return 400 "No fields provided for update".

---

## Failed Attempts

- **`isBcryptHash` using `bcrypt.getRounds()`** — Failed because the version of bcryptjs in use does not throw for strings of length ≠ 60. It returned `true` for the plain-text string `"12345678"`, sending all plain-text logins down the bcrypt path. Fixed with regex `^\$2[abyA-Z]\$\d{2}\$`.

- **Sending `{ passwordHash }` to PATCH `/bc/custom/contacts/{id}`** — Returned 400 `{"detail": "No fields provided for update"}` because the `RgmcContactUpdate` Pydantic model did not include `passwordHash`. The field was silently dropped by `model_dump(exclude_none=True)`. Fixed by adding the field to the model.

- **`await sync()` before `router.replace('/app/home')` in `SetPasswordModal`** — Navigation never executed because `forcePasswordSetup = false` (modal dismissed) while sync was still running, causing the component to unmount before `router.replace` fired. Fixed by making `sync()` fire-and-forget.

- **`console.debug` for login tracing** — Chrome DevTools hides `console.debug` at default log level ("Verbose" must be enabled). Switched to `console.log`. Debug lines were removed once the root cause was identified.

- **Initial GCP picture approach (multi-step binary streaming)** — Originally implemented as: GET picture metadata → extract picture ID → GET binary content → stream back. This was replaced by the user with a simpler approach using a dedicated BC AL page (`contactPictures`) that returns/accepts base64 JSON directly without a separate content URL.

---

## Next Step

**Deploy the GCP API changes to Cloud Run** and test the photo endpoints end-to-end:

```bash
# From C:\RGMC\Source\git\rgmc-gcp-api
gcloud run deploy <service-name> --source . --region <region>
```

Then in the frontend, log in and verify:
1. `authStore.photoUrl` populates after login (check `localStorage` key `rgmc_auth_photo`)
2. `UserAvatar` in `ProfileMenu` trigger and popover shows the photo
3. Tapping the camera badge in `ProfileModal` opens the file picker and updates the photo

If BC returns an empty/blank JPEG for contacts with no photo set, `getContactPicture` checks `res.data.size === 0` and returns `null` — `UserAvatar` will fall back to initials correctly.

---

## Context & Gotchas

- **BC `contactPictures` AL page (Pag50204)**: Dedicated custom AL API page exposing the contact's `Image` field as base64 in a `picture` JSON field. Uses contact SystemId as the key. Insert and Delete are not allowed — only GET and PATCH. The GCP API wraps this into a simple HTTP interface.

- **`displayName` vs `name`**: BC custom contacts API returns `name`, not `displayName`. `getContacts()` in `api.service.ts` normalizes this. Without it, `findCandidate` by displayName would always fail and `ProfileModal` hero name would be blank.

- **`isBcryptHash` regex**: Pattern is `^\$2[abyA-Z]\$\d{2}\$` — matches `$2b$10$`, `$2a$12$`, `$2y$10$` etc. Any plain-text string (including "12345678") will not match. Do not revert to `bcrypt.getRounds()`.

- **Photo caching**: Stored as a base64 data URL in `localStorage` under key `rgmc_auth_photo`. A typical compressed JPEG (~50KB) becomes ~67KB base64. No size guard implemented — large photos could stress the 5MB localStorage limit.

- **`UserAvatar` overflow clipping**: Parent class (`.avatar-sm`, `.pop-avatar`, `.hero-avatar`) must have `border-radius` set for the image to be circular. `UserAvatar`'s root `.ua-wrap` sets `overflow: hidden`. If a parent is missing `border-radius`, the photo appears as a square.

- **`completePasswordSetup` does NOT call `fetchAndCachePhoto()`**: After the password setup flow, photo is not auto-fetched. Photo fetch happens when `sync()` runs in the background. If photo should appear immediately post-setup, add `authStore.fetchAndCachePhoto()` in `SetPasswordModal.vue` after `completePasswordSetup`.

- **GCP API local vs deployed**: All Python changes are local at `C:\RGMC\Source\git\rgmc-gcp-api`. The live Cloud Run instance has NOT been updated. The frontend's picture endpoints will 404 until redeployed.

- **Vite dev proxy**: In dev mode, `/bc/*` is proxied to the GCP API origin via `vite.config.ts`. `VITE_API_BASE_URL` env var controls production origin. No auth headers required from the frontend — GCP API authenticates to BC via client credentials OAuth internally.

- **`passwordHash` sync to BC**: After login upgrades a plain-text password to bcrypt, `ApiService.updateContact(id, { passwordHash: hash })` is called fire-and-forget. This now works because `passwordHash` was added to the Pydantic model. However, the BC AL page for contacts must also accept this field — confirmed in `RGMCMemberContactTableExt.al` (field 50251 "Password Hash", Text[100]).
