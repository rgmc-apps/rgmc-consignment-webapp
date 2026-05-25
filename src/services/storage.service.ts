import type {
  AuthSession,
  Brand,
  Contact,
  Customer,
  Item,
  ItemCategory,
  ScanSession,
  SyncTimestamps,
} from '@/types';

const KEYS = {
  AUTH: 'rgmc_auth',
  CACHE_BRANDS: 'rgmc_cache_brands',
  CACHE_CONTACTS: 'rgmc_cache_contacts',
  CACHE_CUSTOMERS: 'rgmc_cache_customers',
  CACHE_ITEMS: 'rgmc_cache_items',
  CACHE_ITEM_CATEGORIES: 'rgmc_cache_item_categories',
  SYNC_TIMESTAMPS: 'rgmc_sync_timestamps',
  SESSIONS: 'rgmc_sessions',
  DRAFTS: 'rgmc_drafts',
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
    console.warn(`[Storage] Failed to write key "${key}":`, e);
  }
}

function remove(key: string): void {
  localStorage.removeItem(key);
}

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
    set(KEYS.CACHE_CONTACTS, contacts);
  },

  getCachedCustomers(): Customer[] {
    return get<Customer[]>(KEYS.CACHE_CUSTOMERS) ?? [];
  },
  setCachedCustomers(customers: Customer[]): void {
    set(KEYS.CACHE_CUSTOMERS, customers);
  },

  getCachedItems(): Item[] {
    return get<Item[]>(KEYS.CACHE_ITEMS) ?? [];
  },
  setCachedItems(items: Item[]): void {
    /* Store only the fields needed to reduce storage footprint */
    const slim = items.map((i) => ({
      id: i.id,
      number: i.number,
      displayName: i.displayName,
      description: i.description,
      type: i.type,
      itemCategoryId: i.itemCategoryId,
      itemCategoryCode: i.itemCategoryCode,
      baseUnitOfMeasure: i.baseUnitOfMeasure,
      unitPrice: i.unitPrice,
      lastModifiedDateTime: i.lastModifiedDateTime,
    }));
    set(KEYS.CACHE_ITEMS, slim);
  },

  getCachedItemCategories(): ItemCategory[] {
    return get<ItemCategory[]>(KEYS.CACHE_ITEM_CATEGORIES) ?? [];
  },
  setCachedItemCategories(categories: ItemCategory[]): void {
    set(KEYS.CACHE_ITEM_CATEGORIES, categories);
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

  /* ─── Utility ─── */
  clearAll(): void {
    Object.values(KEYS).forEach(remove);
  },
};
