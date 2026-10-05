# Android Migration Plan — RGMC Consignment App

## Overview

The app is built on **Ionic 7 + Vue 3 + Capacitor 6**, which means Android is one `npx cap add android` away from the first runnable build. The hard work is (a) fixing the API client for a native context and (b) replacing the browser storage layer with SQLite.

**What already exists:**
- `@capacitor/core` + `@capacitor/cli` v6 installed ✅
- `capacitor.config.ts` with `appId: 'com.rgmc.consignment'` and `androidScheme: 'https'` ✅
- No `android/` folder yet — platform not added

---

## Storage Backend Decision

### Why localStorage is fine on the web but fragile on Android

`localStorage` in a Capacitor WebView is stored in the app's private WebView data directory. Android can **clear WebView storage** under system memory pressure or during system updates. Unlike the browser, there is no user warning. The app would lose all cached data silently.

`IndexedDB` has the same risk — it lives in the same WebView data area.

### Recommended replacement: `@capacitor-community/sqlite` with a hybrid read-through model

**Why not `@capacitor/preferences`?**  
Preferences (SharedPreferences) avoids the WebView-clear risk, but it is still a flat key-value store and has a per-key size limit (~1 MB). The items catalog is several MB.

**Why not `@ionic/storage`?**  
It is a wrapper over either IndexedDB (web) or SQLite (native). It stores everything as a JSON blob under a single key — items would still be one giant JSON string. Fine as an intermediate step, but not meaningfully better than IndexedDB for data integrity.

**Recommended: `@capacitor-community/sqlite` directly, with a memory-mirror pattern**

Schema:
- `kv_store(key TEXT PRIMARY KEY, value TEXT)` — replaces all localStorage keys
- `items(id TEXT PRIMARY KEY, number TEXT, display_name TEXT, description TEXT, item_category_code TEXT, family_code TEXT, unit_price_inc_vat REAL, price_list_code TEXT)` — replaces IndexedDB blob

This mirrors what the current code already does:  
- `StorageService` getters are **synchronous** — they read from in-memory mirrors  
- `StorageService` setters **update memory first**, then persist to SQLite async (fire and forget)  
- `StorageService.init()` loads the SQLite DB into memory at startup  

No callers need to be made async. The sync API surface stays identical.

---

## Phase 1 — Add Android Platform (no storage changes yet)

This phase gets the app running on Android using the existing localStorage/IndexedDB. It is a useful milestone to validate that the UI, routing, Ionic components, and API calls all work before tackling storage.

### 1.1 Install Android Studio

Download: https://developer.android.com/studio  
Required SDK: Android 14 (API 34) — install via SDK Manager inside Android Studio  
Set `JAVA_HOME` to the JDK bundled with Android Studio (usually `C:\Program Files\Android\Android Studio\jbr`)

### 1.2 Fix the API base URL

The `apiClient` uses `baseURL: ''` which means relative URLs. On the web this works because nginx proxies `/bc/...` to the BC API. In a Capacitor WebView there is no proxy — all calls go to `https://localhost/bc/...` which returns 404.

**`src/services/api.service.ts`** — change the axios creation:

```typescript
import { Capacitor } from '@capacitor/core';

const apiClient = axios.create({
  baseURL: Capacitor.isNativePlatform()
    ? (import.meta.env.VITE_API_BASE_URL ?? '')
    : '',
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});
```

Create **`.env.android`** (gitignored):
```
VITE_API_BASE_URL=https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app
```

Build for Android using this env file:
```bash
npx vite build --mode android
```

Or add a script to `package.json`:
```json
"build:android": "vue-tsc && vite build --mode android"
```

### 1.3 Configure Capacitor server URL (optional but useful for live reload)

In `capacitor.config.ts`, you can add a `server.url` for dev builds:
```typescript
server: {
  androidScheme: 'https',
  // Uncomment for live reload during development:
  // url: 'http://192.168.x.x:8100',
  // cleartext: true,
},
```

### 1.4 Add the Android platform

```bash
npm run build:android
npx cap add android
npx cap sync
```

### 1.5 Open in Android Studio and run

```bash
npx cap open android
```

In Android Studio: Run → Run 'app' (on a device or emulator with API 34).

### 1.6 Fix CORS on the BC API

Capacitor Android sends requests from the origin `https://localhost`. The BC API (`rgmc-bc-api`) must allow this.

In `C:\claude\rgmc-bc-api\src\main.py` (or wherever CORSMiddleware is configured), add `https://localhost` to the `allow_origins` list:

```python
allow_origins=[
    "https://localhost",
    "capacitor://localhost",
    # ... existing origins
]
```

Deploy the BC API after this change.

---

## Phase 2 — Replace Storage with SQLite

### 2.1 Install the SQLite plugin

```bash
npm install @capacitor-community/sqlite
npx cap sync
```

For Android, no extra `AndroidManifest.xml` changes are needed — the plugin creates the database in the app's private files directory automatically.

### 2.2 Create a database service

Create **`src/services/db.service.ts`**:

```typescript
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv_store (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS items (
    id                  TEXT PRIMARY KEY,
    number              TEXT,
    display_name        TEXT,
    description         TEXT,
    item_category_code  TEXT,
    family_code         TEXT,
    unit_price_inc_vat  REAL,
    price_list_code     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_items_family_code ON items (family_code);
`;

export async function openDb(): Promise<SQLiteDBConnection> {
  if (db) return db;
  if (Capacitor.isNativePlatform()) {
    await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection('rgmc', false)).result;
    db = isConn
      ? await sqlite.retrieveConnection('rgmc', false)
      : await sqlite.createConnection('rgmc', false, 'no-encryption', 1, false);
    await db.open();
    await db.execute(SCHEMA);
  }
  return db!;
}

/** kv_store helpers */
export async function kvGet<T>(key: string): Promise<T | null> {
  if (!db) return null;
  const res = await db.query('SELECT value FROM kv_store WHERE key = ?', [key]);
  const row = res.values?.[0];
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (!db) return;
  await db.run('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

export async function kvRemove(key: string): Promise<void> {
  if (!db) return;
  await db.run('DELETE FROM kv_store WHERE key = ?', [key]);
}
```

### 2.3 Update StorageService.init()

The memory-mirror pattern means **callers don't change** — only `init()` and the internal persistence calls change.

In **`src/services/storage.service.ts`**, replace the `init()` and `loadCachedItemsAsync()` methods:

```typescript
import { openDb, kvGet, kvSet, kvRemove } from './db.service';
import { Capacitor } from '@capacitor/core';

// Internal memory mirrors (unchanged)
let _authMemory: AuthSession | null = null;
let _companyMemory: Company | null = null;
// ... one mirror per KEYS entry

export const StorageService = {
  async init(): Promise<void> {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        await openDb();
        // Load all keys from SQLite into memory mirrors
        _authMemory        = await kvGet<AuthSession>(KEYS.AUTH);
        _companyMemory     = await kvGet<Company>(KEYS.COMPANY);
        // ... load all other keys

        // Load items from items table
        const db = await openDb();
        const res = await db.query('SELECT * FROM items');
        _itemsMemory = (res.values ?? []).map(rowToItem);
      } else {
        // Web: existing localStorage + IDB path
        await loadCachedItemsAsync();
      }
    })();
    return _initPromise;
  },

  // Synchronous getters read from memory (unchanged API)
  getAuth(): AuthSession | null {
    return Capacitor.isNativePlatform() ? _authMemory : get<AuthSession>(KEYS.AUTH);
  },
  setAuth(session: AuthSession): void {
    if (Capacitor.isNativePlatform()) {
      _authMemory = session;
      kvSet(KEYS.AUTH, session).catch(() => {});
    } else {
      set(KEYS.AUTH, session);
    }
  },
  // ... same pattern for every key
```

> **Note:** The `if (Capacitor.isNativePlatform())` branches can be cleaned up once the web app is no longer a priority target. For now, keeping both paths ensures the web PWA continues working unchanged.

### 2.4 Migrate the items layer to SQLite rows

Replace the `setCachedItems`, `mergeCachedItems`, and `patchCachedItemPrice` methods to write to the `items` table instead of the IDB blob:

```typescript
setCachedItems(items: Item[], brand?: string): void {
  const slim = items.map(toSlim);  // same slimming logic as now
  if (brand) {
    const slimIds = new Set(slim.map(i => i.id));
    _itemsMemory = [..._itemsMemory.filter(i => i.familyCode !== brand && !slimIds.has(i.id)), ...slim];
  } else {
    _itemsMemory = slim;
  }

  if (Capacitor.isNativePlatform()) {
    openDb().then(async db => {
      await db.execute('BEGIN TRANSACTION');
      if (brand) {
        await db.run('DELETE FROM items WHERE family_code = ?', [brand]);
      } else {
        await db.run('DELETE FROM items');
      }
      for (const item of slim) {
        await db.run(
          `INSERT OR REPLACE INTO items VALUES (?,?,?,?,?,?,?,?)`,
          [item.id, item.number, item.displayName, item.description,
           item.itemCategoryCode, item.familyCode ?? null,
           item.unitPriceIncVAT ?? null, item.priceListCode ?? null]
        );
      }
      await db.execute('COMMIT');
    }).catch(() => {});
  } else {
    // Web: existing IDB path
    openItemsIDB().then(db => { ... }).catch(() => {});
  }
},
```

---

## Phase 3 — Android-Specific Adjustments

### 3.1 Status bar & splash screen

```bash
npm install @capacitor/status-bar @capacitor/splash-screen
npx cap sync
```

In `src/main.ts` or `App.vue`:
```typescript
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark });
  SplashScreen.hide();
}
```

### 3.2 Hardware back button

Ionic's `IonBackButton` and `router-link` handle this automatically. Verify that:
- Back button exits modals (IonModal) correctly
- Back button on the root page exits the app (Ionic does this by default)

If a modal needs to intercept back, add:
```typescript
import { App } from '@capacitor/app';
App.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) router.back();
  else App.exitApp();
});
```

### 3.3 Keyboard avoidance

Ionic's scroll assist handles this. Add to `capacitor.config.ts`:
```typescript
plugins: {
  Keyboard: {
    resize: 'body',
    style: 'dark',
    resizeOnFullScreen: true,
  },
},
```

### 3.4 Network connectivity

The app has offline support via cached data. On Android, you can use the Network API for finer control:
```bash
npm install @capacitor/network
```

### 3.5 App data backup

By default, Android backs up app data (including the SQLite DB) to Google Drive. To disable backup of the SQLite file (it could be large), add to `android/app/src/main/AndroidManifest.xml`:
```xml
<application
  android:allowBackup="false"
  ...>
```

Or selectively exclude:
```xml
android:fullBackupContent="@xml/backup_rules"
```

---

## Phase 4 — Build and Distribute

### 4.1 Debug build (testing)

```bash
npm run build:android
npx cap sync
npx cap open android
# In Android Studio: Run → Run 'app'
```

Or from CLI:
```bash
npx cap run android --target <device-id>
```

### 4.2 Release build

1. Generate a signing keystore (one time):
   ```bash
   keytool -genkey -v -keystore rgmc-consignment.jks -keyalg RSA -keysize 2048 -validity 10000 -alias rgmc
   ```
   Store the `.jks` file securely (not in git).

2. Add signing config to `android/app/build.gradle`:
   ```groovy
   android {
     signingConfigs {
       release {
         storeFile file('../rgmc-consignment.jks')
         storePassword System.getenv('KEYSTORE_PASSWORD')
         keyAlias 'rgmc'
         keyPassword System.getenv('KEY_PASSWORD')
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
         minifyEnabled false
       }
     }
   }
   ```

3. Build the release APK or AAB:
   ```bash
   cd android
   ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
   ./gradlew bundleRelease     # → app/build/outputs/bundle/release/app-release.aab  (Play Store)
   ```

4. For internal distribution (no Play Store), use the `.apk` directly via ADB or a file share.

---

## Execution Order Summary

| Order | Phase | Est. effort | Dependency |
|-------|-------|-------------|------------|
| 1 | Fix API base URL (`Capacitor.isNativePlatform()`) | 30 min | none |
| 2 | Add Android platform + first build | 1 h | Android Studio installed |
| 3 | Fix BC API CORS for `https://localhost` | 15 min + deploy | BC API deploy |
| 4 | Smoke-test on device (auth, sync, scanning) | 1-2 h | Steps 1-3 |
| 5 | Install `@capacitor-community/sqlite` + write `db.service.ts` | 2 h | none |
| 6 | Migrate `StorageService.init()` to load from SQLite | 3 h | Step 5 |
| 7 | Migrate `setCachedItems` / `mergeCachedItems` to SQLite rows | 2 h | Step 5 |
| 8 | Migrate all remaining `kv_store` keys (auth, customers, etc.) | 2 h | Step 5 |
| 9 | Status bar, splash screen, keyboard polish | 1 h | Steps 1-4 |
| 10 | Release build + signing | 1 h | Step 9 |

Total estimated effort: **~14 hours** across two to three sessions.

---

## Files That Will Change

| File | What changes |
|------|-------------|
| `src/services/api.service.ts` | `baseURL` conditional on `Capacitor.isNativePlatform()` |
| `src/services/storage.service.ts` | `init()`, all set/get methods get SQLite branches |
| `src/services/db.service.ts` | **New file** — SQLite connection + kv helpers |
| `capacitor.config.ts` | Keyboard plugin config |
| `vite.config.ts` | No change (`.env.android` handles the mode) |
| `package.json` | `build:android` script |
| `.env.android` | **New file** (gitignored) — `VITE_API_BASE_URL` |
| `android/` | **New directory** — generated by `npx cap add android` |
| `C:\claude\rgmc-bc-api\src\main.py` | CORS allow `https://localhost` |

---

## Gotchas

- **`npx cap sync` must be run after every `npm run build:android`** — it copies the `dist/` output into `android/app/src/main/assets/public/`. Forgetting this is a common cause of stale UI on device.
- **`@capacitor-community/sqlite` requires Jeep's web component on web** (`jeep-sqlite` custom element) if you want the web fallback to also use SQLite. If the web app keeps its current localStorage/IDB path, this is not needed.
- **The `android/` directory is typically gitignored** but you may want to commit it to avoid regenerating the platform. Check `.gitignore` — Capacitor projects usually commit `android/`.
- **BC API CORS**: Capacitor Android uses origin `https://localhost` (because `androidScheme: 'https'` is set in `capacitor.config.ts`). Without this CORS origin, every API call returns a CORS error.
- **`@capacitor-community/sqlite` transactions are important for bulk item writes** — inserting 500+ items row-by-row without `BEGIN TRANSACTION / COMMIT` is extremely slow (~30 s). Always wrap bulk inserts in a transaction.
- **In-memory mirror pattern means a crash between `set_memory` and `SQLite persist` loses one write** — acceptable for a cache layer. If you need stronger guarantees for sessions/drafts (orders in progress), write those synchronously with `await kvSet(...)` before updating the UI.
- **SQLite DB is not encrypted by default** — if the device is rooted, a user can read the DB. For auth tokens, consider using `@capacitor/secure-storage` (uses Android Keystore) instead of the `kv_store` table.
- **Web PWA and Android APK are separate artifacts** — the PWA (nginx Cloud Run) continues to work unchanged; the Android APK is a separate distribution. Both share the same source code and API backend.
