import type {
  AuthSession,
  Brand,
  Company,
  Contact,
  Customer,
  Item,
  ItemCategory,
  ScanSession,
  SyncTimestampEntry,
  SyncTimestamps,
} from '@/types';

const KEYS = {
  AUTH: 'rgmc_auth',
  AUTH_PHOTO: 'rgmc_auth_photo',
  COMPANY: 'rgmc_company',
  CACHE_BRANDS: 'rgmc_cache_brands',
  CACHE_CONTACTS: 'rgmc_cache_contacts',
  CACHE_CUSTOMERS: 'rgmc_cache_customers',
  CACHE_ITEM_CATEGORIES: 'rgmc_cache_item_categories',
  CACHE_ITEM_PRICES: 'rgmc_cache_item_prices',
  SYNC_TIMESTAMPS: 'rgmc_sync_timestamps',
  SYNC_DATA_AGE: 'rgmc_sync_data_age',
  SYNC_DURATION: 'rgmc_sync_duration',
  SESSIONS: 'rgmc_sessions',
  DRAFTS: 'rgmc_drafts',
  WELCOME_SEEN: 'rgmc_welcome_seen',
  LAST_CUSTOMER_ID: 'rgmc_last_customer_id',
} as const;

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
  }
}

function remove(key: string): void {
  localStorage.removeItem(key);
}

/* Items are too large for localStorage's 5MB per-origin cap.
   Primary store: module-level variable for in-session access.
   Secondary store: IndexedDB so items survive tab refresh / offline restarts.

   Stored as one record per item (keyPath 'id'), not one giant array under a single
   key — a single scanned-item price correction (patchCachedItemPrice, fired on
   nearly every scan confirm) only needs to write that one record instead of
   re-serializing and rewriting the entire catalog on every patch. */
let _itemsMemory: Item[] = [];

const IDB_NAME = 'rgmc-cache';
const IDB_ITEMS_STORE = 'items_kv';
const IDB_ITEMS_STORE_LEGACY = 'items'; // v1: whole catalog as one blob keyed 'all'

function openItemsIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      const newStore = db.objectStoreNames.contains(IDB_ITEMS_STORE)
        ? tx!.objectStore(IDB_ITEMS_STORE)
        : db.createObjectStore(IDB_ITEMS_STORE, { keyPath: 'id' });
      // One-time migration: pull the old single-blob cache into the new per-item
      // store, then drop it — keeps the "new" sync's semantics for existing users
      // instead of forcing a full resync on upgrade.
      if (db.objectStoreNames.contains(IDB_ITEMS_STORE_LEGACY)) {
        const legacyStore = tx!.objectStore(IDB_ITEMS_STORE_LEGACY);
        const getReq = legacyStore.get('all');
        getReq.onsuccess = () => {
          const legacyItems = (getReq.result as Item[]) ?? [];
          for (const item of legacyItems) newStore.put(item);
          db.deleteObjectStore(IDB_ITEMS_STORE_LEGACY);
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

/** Upsert only the given records — O(records), not O(whole catalog). Used for
 *  incremental merges and single/few-item price patches. */
function putItemsIDB(items: Item[]): void {
  if (!items.length) return;
  openItemsIDB().then((db) => {
    const tx = db.transaction(IDB_ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_ITEMS_STORE);
    for (const item of items) store.put(item);
    tx.oncomplete = () => db.close();
    tx.onerror   = () => db.close();
  }).catch(() => {});
}

/** Replace the store's contents with exactly this set — used for a full (non-delta)
 *  sync, where every record is expected to change anyway. */
function replaceAllItemsIDB(items: Item[]): void {
  openItemsIDB().then((db) => {
    const tx = db.transaction(IDB_ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_ITEMS_STORE);
    store.clear();
    for (const item of items) store.put(item);
    tx.oncomplete = () => db.close();
    tx.onerror   = () => db.close();
  }).catch(() => {});
}

let _initPromise: Promise<void> | null = null;

export const StorageService = {
  /* ─── Auth ─── */
  getAuth(): AuthSession | null {
    return get<AuthSession>(KEYS.AUTH);
  },
  setAuth(session: AuthSession): void {
    set(KEYS.AUTH, session);
  },
  clearAuth(): void {
    remove(KEYS.AUTH);
  },

  /* ─── Selected company ─── */
  getCompany(): Company | null {
    return get<Company>(KEYS.COMPANY);
  },
  setCompany(company: Company): void {
    set(KEYS.COMPANY, company);
  },
  clearCompany(): void {
    remove(KEYS.COMPANY);
  },

  /* ─── Auth photo (base64 data URL, cached for offline use) ─── */
  getAuthPhoto(): string | null {
    return localStorage.getItem(KEYS.AUTH_PHOTO) ?? null;
  },
  setAuthPhoto(dataUrl: string): void {
    try { localStorage.setItem(KEYS.AUTH_PHOTO, dataUrl); } catch {}
  },
  clearAuthPhoto(): void {
    localStorage.removeItem(KEYS.AUTH_PHOTO);
  },

  /* ─── Cached master data ─── */
  getCachedBrands(): Brand[] {
    return get<Brand[]>(KEYS.CACHE_BRANDS) ?? [];
  },
  setCachedBrands(brands: Brand[]): void {
    set(KEYS.CACHE_BRANDS, brands);
  },

  getCachedContacts(): Contact[] {
    return get<Contact[]>(KEYS.CACHE_CONTACTS) ?? [];
  },
  setCachedContacts(contacts: Contact[]): void {
    const existing = get<Contact[]>(KEYS.CACHE_CONTACTS) ?? [];
    const merged = contacts.map((c) => {
      const prev = existing.find((e) => e.id === c.id);
      return {
        ...c,
        // Preserve locally-set fields the API doesn't return
        username:     c.username     ?? prev?.username,
        passwordHash: c.passwordHash ?? prev?.passwordHash,
      };
    });
    set(KEYS.CACHE_CONTACTS, merged);
  },
  /** Upsert a partial list of contacts into the cache (incremental sync). */
  mergeCachedContacts(updates: Contact[]): void {
    if (!updates.length) return;
    const existing = get<Contact[]>(KEYS.CACHE_CONTACTS) ?? [];
    const map = new Map(existing.map((c) => [c.id, c]));
    for (const c of updates) {
      const prev = map.get(c.id);
      map.set(c.id, {
        ...c,
        username:     c.username     ?? prev?.username,
        passwordHash: c.passwordHash ?? prev?.passwordHash,
      });
    }
    set(KEYS.CACHE_CONTACTS, Array.from(map.values()));
  },

  /** Patch a single contact in the cache without a full rewrite. */
  patchContact(id: string, fields: Partial<Contact>): void {
    const contacts = get<Contact[]>(KEYS.CACHE_CONTACTS) ?? [];
    const idx = contacts.findIndex((c) => c.id === id);
    if (idx < 0) return;
    contacts[idx] = { ...contacts[idx], ...fields };
    set(KEYS.CACHE_CONTACTS, contacts);
  },

  getCachedCustomers(company?: string, brand?: string): Customer[] {
    const raw = get<{ company?: string; data?: Array<{ id: string; number: string; displayName: string; city: string; brandCode?: string }> } | Customer[]>(KEYS.CACHE_CUSTOMERS);
    if (!raw) return [];
    if (Array.isArray(raw)) {
      // Old format (no company context) — treat as stale if a company is expected
      return company ? [] : (raw as Customer[]);
    }
    if (company && raw.company && raw.company !== company) return [];
    const data = raw.data ?? [];
    if (!brand) return data as unknown as Customer[];
    const branded = data.filter((c) => c.brandCode === brand);
    if (branded.length > 0) return branded as unknown as Customer[];
    // Migration fallback: customers cached before brandCode tagging was introduced
    // have no brandCode and are excluded by the strict filter above. When the brand
    // filter returns empty but untagged entries exist, treat them as this brand's
    // customers and tag them in-place so subsequent reads don't need this fallback.
    const untagged = data.filter((c) => !c.brandCode);
    if (untagged.length === 0) return [];
    const tagged = untagged.map((c) => ({ ...c, brandCode: brand }));
    set(KEYS.CACHE_CUSTOMERS, {
      company: raw.company ?? '',
      data: [...data.filter((c) => c.brandCode), ...tagged],
    });
    return tagged as unknown as Customer[];
  },
  setCachedCustomers(customers: Customer[], company?: string, brand?: string): void {
    const slim = customers.map((c) => ({
      id: c.id,
      number: c.number,
      displayName: c.displayName,
      city: c.city,
      ...(brand ? { brandCode: brand } : {}),
    }));
    if (brand) {
      // Replace only this brand's entries — keep other brands' data intact.
      const raw = get<{ company?: string; data?: Array<{ id: string; number: string; displayName: string; city: string; brandCode?: string }> } | Customer[]>(KEYS.CACHE_CUSTOMERS);
      const existing = raw && !Array.isArray(raw) ? (raw.data ?? []) : [];
      const otherBrands = existing.filter((e) => e.brandCode !== brand);
      set(KEYS.CACHE_CUSTOMERS, { company: company ?? '', data: [...otherBrands, ...slim] });
    } else {
      set(KEYS.CACHE_CUSTOMERS, { company: company ?? '', data: slim });
    }
  },
  /** Upsert a partial list of customers into the cache (incremental sync). */
  mergeCachedCustomers(updates: Customer[], company?: string, brand?: string): void {
    if (!updates.length) return;
    const raw = get<{ company?: string; data?: Array<{ id: string; number: string; displayName: string; city: string; brandCode?: string }> } | Customer[]>(KEYS.CACHE_CUSTOMERS);
    const existing: Array<{ id: string; number: string; displayName: string; city: string; brandCode?: string }> =
      raw && !Array.isArray(raw) ? (raw.data ?? []) : [];
    // Key by brand::id so the same customer ID in two different brands stays separate.
    const key = (e: { id: string; brandCode?: string }) => `${e.brandCode ?? ''}::${e.id}`;
    const map = new Map(existing.map((c) => [key(c), c]));
    for (const c of updates) {
      const entry = { id: c.id, number: c.number, displayName: c.displayName, city: c.city, ...(brand ? { brandCode: brand } : {}) };
      map.set(key(entry), entry);
    }
    set(KEYS.CACHE_CUSTOMERS, { company: company ?? '', data: Array.from(map.values()) });
  },

  /* Items: in-memory + IndexedDB for offline persistence */
  getCachedItems(): Item[] {
    return _itemsMemory;
  },
  setCachedItems(items: Item[], brand?: string): void {
    const slim = items.map((i) => ({
      id: i.id,
      number: i.number,
      displayName: i.displayName,
      description: i.description ? i.description.slice(0, 120) : '',
      itemCategoryCode: i.itemCategoryCode,
      // When syncing for a specific brand, tag items that lack a familyCode so the
      // brand filter in refreshCache() can resolve them after a cache restore.
      familyCode: i.familyCode ?? (brand || undefined),
      unitPriceIncVAT: i.unitPriceIncVAT,
      priceListCode: i.priceListCode,
    })) as Item[];
    if (brand) {
      // Keep items from other brands; replace this brand's items.
      // slim takes precedence: exclude from "others" any item whose id appears in slim
      // so null/undefined-familyCode items don't accumulate as duplicates across syncs.
      const slimIds = new Set(slim.map((i) => i.id));
      const others = _itemsMemory.filter((i) => i.familyCode !== brand && !slimIds.has(i.id));
      _itemsMemory = [...others, ...slim];
    } else {
      _itemsMemory = slim;
    }
    // Fire and forget so the sync isn't blocked — this is a full (non-delta) sync, so
    // every record is expected to change anyway and a full replace is appropriate.
    replaceAllItemsIDB(_itemsMemory);
  },

  /** Upsert a partial list of items into the cache (incremental sync). Existing items are
   *  replaced in-place by id; new items are appended. Items from other brands are untouched. */
  mergeCachedItems(items: Item[], brand?: string): void {
    if (!items.length) return;
    const slim = items.map((i) => ({
      id: i.id,
      number: i.number,
      displayName: i.displayName,
      description: i.description ? i.description.slice(0, 120) : '',
      itemCategoryCode: i.itemCategoryCode,
      familyCode: i.familyCode ?? (brand || undefined),
      unitPriceIncVAT: i.unitPriceIncVAT,
      priceListCode: i.priceListCode,
    })) as Item[];
    const incomingById = new Map(slim.map((i) => [i.id, i]));
    const existingIds = new Set(_itemsMemory.map((i) => i.id));
    _itemsMemory = [
      ..._itemsMemory.map((i) => incomingById.get(i.id) ?? i),
      ...slim.filter((i) => !existingIds.has(i.id)),
    ];
    // Only the incoming (changed/new) records need writing — unlike a full sync,
    // the rest of the catalog is untouched.
    putItemsIDB(slim);
  },

  patchCachedItemPrice(itemNumber: string, unitPrice: number): void {
    const item = _itemsMemory.find((i) => i.number === itemNumber);
    if (!item) return;
    item.unitPriceIncVAT = unitPrice;
    putItemsIDB([item]);
  },

  applyPriceMapToItems(prices: Record<string, number>, brand?: string): void {
    const changedItems: Item[] = [];
    for (const item of _itemsMemory) {
      // Skip items from other brands to prevent cross-brand price corruption.
      if (brand && item.familyCode !== brand) continue;
      const price = prices[item.number];
      if (price !== undefined && item.unitPriceIncVAT !== price) {
        item.unitPriceIncVAT = price;
        changedItems.push(item);
      }
    }
    // Only the items whose price actually changed need writing.
    putItemsIDB(changedItems);
  },

  /* Restore items from IndexedDB into _itemsMemory on startup */
  async loadCachedItemsAsync(): Promise<Item[]> {
    try {
      const db = await openItemsIDB();
      const items = await new Promise<Item[]>((res) => {
        const tx  = db.transaction(IDB_ITEMS_STORE, 'readonly');
        const req = tx.objectStore(IDB_ITEMS_STORE).getAll();
        req.onsuccess = () => { db.close(); res((req.result as Item[]) ?? []); };
        req.onerror   = () => { db.close(); res([]); };
      });
      if (items.length) _itemsMemory = items;
      return items;
    } catch {
      return _itemsMemory;
    }
  },

  /* Idempotent startup initialiser — call once at app mount.
     Loads items from IDB so offline scanning works after a refresh. */
  init(): Promise<void> {
    if (!_initPromise) {
      _initPromise = this.loadCachedItemsAsync().then(() => undefined);
    }
    return _initPromise;
  },

  getCachedItemCategories(): ItemCategory[] {
    return get<ItemCategory[]>(KEYS.CACHE_ITEM_CATEGORIES) ?? [];
  },
  setCachedItemCategories(categories: ItemCategory[]): void {
    set(KEYS.CACHE_ITEM_CATEGORIES, categories);
  },
  /** Upsert a partial list of categories into the cache (incremental sync). */
  mergeCachedItemCategories(updates: ItemCategory[]): void {
    if (!updates.length) return;
    const existing = this.getCachedItemCategories();
    const map = new Map(existing.map((c) => [c.id, c]));
    for (const c of updates) map.set(c.id, c);
    set(KEYS.CACHE_ITEM_CATEGORIES, Array.from(map.values()));
  },

  getCachedItemPrices(): { date: string; prices: Record<string, number> } | null {
    return get<{ date: string; prices: Record<string, number> }>(KEYS.CACHE_ITEM_PRICES);
  },
  setCachedItemPrices(date: string, prices: Record<string, number>): void {
    set(KEYS.CACHE_ITEM_PRICES, { date, prices });
  },
  /** Patch a single item's price for the given date in place, without cloning the
   *  entire price map first. localStorage only writes whole values, so the full map
   *  still gets re-serialized — but every call site that corrects one item's price
   *  after a live BC check was separately doing get + spread-clone + set; this
   *  collapses that into one call and skips the extra clone. */
  patchCachedItemPriceForDate(date: string, itemNumber: string, price: number): void {
    const cached = get<{ date: string; prices: Record<string, number> }>(KEYS.CACHE_ITEM_PRICES);
    const prices = cached?.date === date ? cached.prices : {};
    prices[itemNumber] = price;
    set(KEYS.CACHE_ITEM_PRICES, { date, prices });
  },

  /* ─── Sync timestamps (keyed by "companyCode::brandCode") ─── */
  getSyncTimestamps(company: string, brand: string): SyncTimestampEntry {
    const raw = get<Record<string, unknown>>(KEYS.SYNC_TIMESTAMPS);
    if (!raw) return {};
    // Old format had flat keys ('customers', 'items', 'itemCategories') at the top level.
    // Detect and wipe it so the new nested format is always used.
    if ('customers' in raw || 'items' in raw || 'itemCategories' in raw) {
      remove(KEYS.SYNC_TIMESTAMPS);
      return {};
    }
    return (raw as SyncTimestamps)[`${company}::${brand}`] ?? {};
  },
  setSyncTimestamp(key: keyof SyncTimestampEntry, company: string, brand: string): void {
    const raw = get<Record<string, unknown>>(KEYS.SYNC_TIMESTAMPS) ?? {};
    // Wipe old flat format if detected
    const isOld = 'customers' in raw || 'items' in raw || 'itemCategories' in raw;
    const all: SyncTimestamps = isOld ? {} : (raw as SyncTimestamps);
    const k = `${company}::${brand}`;
    if (!all[k]) all[k] = {};
    all[k]![key] = new Date().toISOString();
    set(KEYS.SYNC_TIMESTAMPS, all);
  },
  getLastSync(company: string, brand: string): Date | null {
    const entry = this.getSyncTimestamps(company, brand);
    const vals = Object.values(entry).filter(Boolean) as string[];
    if (!vals.length) return null;
    const latest = vals.reduce((a, b) => (a > b ? a : b));
    return new Date(latest);
  },
  /** Returns all per-company-brand entries for display or debug. */
  getAllSyncTimestamps(): SyncTimestamps {
    const raw = get<Record<string, unknown>>(KEYS.SYNC_TIMESTAMPS);
    if (!raw || 'customers' in raw || 'items' in raw || 'itemCategories' in raw) return {};
    return raw as SyncTimestamps;
  },
  clearSyncTimestamps(): void {
    remove(KEYS.SYNC_TIMESTAMPS);
  },

  /* ─── Sync data age (hours before cached data is considered stale) ─── */
  getSyncDataAge(): number {
    const raw = localStorage.getItem(KEYS.SYNC_DATA_AGE);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 24;
  },
  setSyncDataAge(hours: number): void {
    localStorage.setItem(KEYS.SYNC_DATA_AGE, String(Math.max(1, Math.round(hours))));
  },

  /* ─── Last sync duration (seconds) ─── */
  getSyncDuration(): number | null {
    const raw = localStorage.getItem(KEYS.SYNC_DURATION);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  },
  setSyncDuration(seconds: number): void {
    localStorage.setItem(KEYS.SYNC_DURATION, String(Math.round(seconds)));
  },

  /* ─── Sessions (history) ─── */
  getSessions(): ScanSession[] {
    return get<ScanSession[]>(KEYS.SESSIONS) ?? [];
  },
  /** Returns the resulting list so callers (session.store.ts fires this on nearly
   *  every submit/retry) don't need a separate getSessions() round trip — a second
   *  full localStorage read + JSON.parse of the data this call just wrote — right
   *  after writing. Also caps local retention: Firestore (see ApiService.
   *  getSessionHistory) is the canonical long-term history, so local storage only
   *  needs enough for fast offline access to recent activity. */
  saveSession(session: ScanSession): ScanSession[] {
    const MAX_LOCAL_SESSIONS = 200;
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    if (sessions.length > MAX_LOCAL_SESSIONS) sessions.length = MAX_LOCAL_SESSIONS;
    set(KEYS.SESSIONS, sessions);
    return sessions;
  },
  removeSession(sessionId: string): ScanSession[] {
    const sessions = this.getSessions().filter((s) => s.id !== sessionId);
    set(KEYS.SESSIONS, sessions);
    return sessions;
  },

  /* ─── Drafts ─── */
  // Not retention-capped like sessions — a draft is unsynced in-progress work with no
  // Firestore backup, so dropping one for space would lose data, not just history.
  getDrafts(): ScanSession[] {
    return get<ScanSession[]>(KEYS.DRAFTS) ?? [];
  },
  /** Returns the resulting list — see saveSession's note on avoiding a redundant
   *  read-after-write. This one matters more: it fires on nearly every field edit
   *  during an active scanning session (session.store.ts's _saveDraft). */
  saveDraft(session: ScanSession): ScanSession[] {
    const drafts = this.getDrafts();
    const idx = drafts.findIndex((d) => d.id === session.id);
    if (idx >= 0) {
      drafts[idx] = session;
    } else {
      drafts.unshift(session);
    }
    set(KEYS.DRAFTS, drafts);
    return drafts;
  },
  removeDraft(sessionId: string): ScanSession[] {
    const drafts = this.getDrafts().filter((d) => d.id !== sessionId);
    set(KEYS.DRAFTS, drafts);
    return drafts;
  },
  clearAllDrafts(): void {
    remove(KEYS.DRAFTS);
  },

  /* ─── Last selected customer (persisted across sessions) ─── */
  getLastCustomerId(): string | null {
    return localStorage.getItem(KEYS.LAST_CUSTOMER_ID) ?? null;
  },
  setLastCustomerId(id: string): void {
    localStorage.setItem(KEYS.LAST_CUSTOMER_ID, id);
  },
  clearLastCustomerId(): void {
    localStorage.removeItem(KEYS.LAST_CUSTOMER_ID);
  },

  /* ─── Welcome tour ─── */
  hasSeenWelcome(): boolean {
    return localStorage.getItem(KEYS.WELCOME_SEEN) === '1';
  },
  markWelcomeSeen(): void {
    localStorage.setItem(KEYS.WELCOME_SEEN, '1');
  },

  /* ─── Utility ─── */
  clearAll(): void {
    _itemsMemory = [];
    Object.values(KEYS).forEach(remove);
    localStorage.removeItem('rgmc_cache_items');
  },
};
