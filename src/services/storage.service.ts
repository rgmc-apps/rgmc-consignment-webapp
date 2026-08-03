import type {
  AuthSession,
  Brand,
  Company,
  Contact,
  Customer,
  Item,
  ItemCategory,
  ScanSession,
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
  SESSIONS: 'rgmc_sessions',
  DRAFTS: 'rgmc_drafts',
  WELCOME_SEEN: 'rgmc_welcome_seen',
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
   Secondary store: IndexedDB so items survive tab refresh / offline restarts. */
let _itemsMemory: Item[] = [];

const IDB_NAME = 'rgmc-cache';
const IDB_ITEMS_STORE = 'items';

function openItemsIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_ITEMS_STORE)) {
        db.createObjectStore(IDB_ITEMS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
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
  /** Patch a single contact in the cache without a full rewrite. */
  patchContact(id: string, fields: Partial<Contact>): void {
    const contacts = get<Contact[]>(KEYS.CACHE_CONTACTS) ?? [];
    const idx = contacts.findIndex((c) => c.id === id);
    if (idx < 0) return;
    contacts[idx] = { ...contacts[idx], ...fields };
    set(KEYS.CACHE_CONTACTS, contacts);
  },

  getCachedCustomers(company?: string): Customer[] {
    const raw = get<{ company?: string; data?: Customer[] } | Customer[]>(KEYS.CACHE_CUSTOMERS);
    if (!raw) return [];
    if (Array.isArray(raw)) {
      // Old format (no company context) — treat as stale if a company is expected
      return company ? [] : raw;
    }
    if (company && raw.company && raw.company !== company) return [];
    return (raw.data as Customer[]) ?? [];
  },
  setCachedCustomers(customers: Customer[], company?: string): void {
    const slim = customers.map((c) => ({
      id: c.id,
      number: c.number,
      displayName: c.displayName,
      city: c.city,
    }));
    set(KEYS.CACHE_CUSTOMERS, { company: company ?? '', data: slim });
  },

  /* Items: in-memory + IndexedDB for offline persistence */
  getCachedItems(): Item[] {
    return _itemsMemory;
  },
  setCachedItems(items: Item[]): void {
    const slim = items.map((i) => ({
      id: i.id,
      number: i.number,
      displayName: i.displayName,
      description: i.description ? i.description.slice(0, 120) : '',
      itemCategoryCode: i.itemCategoryCode,
      familyCode: i.familyCode,
      unitPriceIncVAT: i.unitPriceIncVAT,
    })) as Item[];
    _itemsMemory = slim;
    // Persist to IndexedDB — fire and forget so the sync isn't blocked
    openItemsIDB().then((db) => {
      const tx = db.transaction(IDB_ITEMS_STORE, 'readwrite');
      tx.objectStore(IDB_ITEMS_STORE).put(slim, 'all');
      tx.oncomplete = () => db.close();
      tx.onerror   = () => db.close();
    }).catch(() => {});
  },

  patchCachedItemPrice(itemNumber: string, unitPrice: number): void {
    const item = _itemsMemory.find((i) => i.number === itemNumber);
    if (!item) return;
    item.unitPriceIncVAT = unitPrice;
    openItemsIDB().then((db) => {
      const tx = db.transaction(IDB_ITEMS_STORE, 'readwrite');
      tx.objectStore(IDB_ITEMS_STORE).put(_itemsMemory, 'all');
      tx.oncomplete = () => db.close();
      tx.onerror   = () => db.close();
    }).catch(() => {});
  },

  applyPriceMapToItems(prices: Record<string, number>): void {
    let changed = false;
    for (const item of _itemsMemory) {
      const price = prices[item.number];
      if (price !== undefined && item.unitPriceIncVAT !== price) {
        item.unitPriceIncVAT = price;
        changed = true;
      }
    }
    if (!changed) return;
    openItemsIDB().then((db) => {
      const tx = db.transaction(IDB_ITEMS_STORE, 'readwrite');
      tx.objectStore(IDB_ITEMS_STORE).put(_itemsMemory, 'all');
      tx.oncomplete = () => db.close();
      tx.onerror   = () => db.close();
    }).catch(() => {});
  },

  /* Restore items from IndexedDB into _itemsMemory on startup */
  async loadCachedItemsAsync(): Promise<Item[]> {
    try {
      const db = await openItemsIDB();
      const items = await new Promise<Item[]>((res) => {
        const tx  = db.transaction(IDB_ITEMS_STORE, 'readonly');
        const req = tx.objectStore(IDB_ITEMS_STORE).get('all');
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

  getCachedItemPrices(): { date: string; prices: Record<string, number> } | null {
    return get<{ date: string; prices: Record<string, number> }>(KEYS.CACHE_ITEM_PRICES);
  },
  setCachedItemPrices(date: string, prices: Record<string, number>): void {
    set(KEYS.CACHE_ITEM_PRICES, { date, prices });
  },

  /* ─── Sync timestamps ─── */
  getSyncTimestamps(): SyncTimestamps {
    return get<SyncTimestamps>(KEYS.SYNC_TIMESTAMPS) ?? {};
  },
  setSyncTimestamp(key: keyof SyncTimestamps): void {
    const ts = this.getSyncTimestamps();
    ts[key] = new Date().toISOString();
    set(KEYS.SYNC_TIMESTAMPS, ts);
  },
  getLastSync(): Date | null {
    const ts = this.getSyncTimestamps();
    const vals = Object.values(ts).filter(Boolean) as string[];
    if (!vals.length) return null;
    const latest = vals.reduce((a, b) => (a > b ? a : b));
    return latest ? new Date(latest) : null;
  },
  clearSyncTimestamps(): void {
    remove(KEYS.SYNC_TIMESTAMPS);
  },

  /* ─── Sessions (history) ─── */
  getSessions(): ScanSession[] {
    return get<ScanSession[]>(KEYS.SESSIONS) ?? [];
  },
  saveSession(session: ScanSession): void {
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    set(KEYS.SESSIONS, sessions);
  },
  removeSession(sessionId: string): void {
    const sessions = this.getSessions().filter((s) => s.id !== sessionId);
    set(KEYS.SESSIONS, sessions);
  },

  /* ─── Drafts ─── */
  getDrafts(): ScanSession[] {
    return get<ScanSession[]>(KEYS.DRAFTS) ?? [];
  },
  saveDraft(session: ScanSession): void {
    const drafts = this.getDrafts();
    const idx = drafts.findIndex((d) => d.id === session.id);
    if (idx >= 0) {
      drafts[idx] = session;
    } else {
      drafts.unshift(session);
    }
    set(KEYS.DRAFTS, drafts);
  },
  removeDraft(sessionId: string): void {
    const drafts = this.getDrafts().filter((d) => d.id !== sessionId);
    set(KEYS.DRAFTS, drafts);
  },
  clearAllDrafts(): void {
    remove(KEYS.DRAFTS);
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
