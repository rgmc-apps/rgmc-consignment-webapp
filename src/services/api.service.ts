import axios from 'axios';

/** Richer error that preserves HTTP status + endpoint for bug reports. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly endpoint?: string,
    public readonly method?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

import type {
  Brand,
  Company,
  Contact,
  ContactUpdatePayload,
  Customer,
  Item,
  ItemCategory,
  ItemFamily,
  SalesOrderPayload,
  SalesReturnOrderPayload,
} from '@/types';

const apiClient = axios.create({
  baseURL: '',
  timeout: 120_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/*
 * Selected company name — set once at login and restored on startup.
 * The request interceptor below injects it as ?company=<name> on every
 * /bc/ call so individual methods never need to handle it.
 */
let _companyName: string | null = null;

export function setApiCompany(name: string | null): void {
  _companyName = name;
}

apiClient.interceptors.request.use((config) => {
  if (_companyName && config.url?.startsWith('/bc/')) {
    config.params = { ...config.params, company: _companyName };
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message: string =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    const status: number | undefined = error.response?.status;
    const endpoint: string | undefined = error.config?.url;
    const method: string | undefined = error.config?.method?.toUpperCase();
    let body: unknown;
    try {
      body = error.config?.data
        ? (typeof error.config.data === 'string' ? JSON.parse(error.config.data) : error.config.data)
        : undefined;
    } catch { body = error.config?.data; }
    return Promise.reject(new ApiError(message, status, endpoint, method, body));
  },
);

/**
 * Extract a list from any of the three shapes the GCP API may return:
 *   { data: T[] }   — our expected wrapper
 *   { value: T[] }  — Business Central OData native
 *   T[]             — bare array
 * Returns [] (never undefined) so callers never crash on .map().
 */
function extractList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b['data']))  return b['data']  as T[];
    if (Array.isArray(b['value'])) return b['value'] as T[];
  }
  return [];
}

/**
 * Fetch one price chunk with per-attempt retry on transient server errors (502/503).
 * AbortErrors propagate immediately. After exhausting retries the chunk returns []
 * so the caller can still use results from other successful chunks.
 */
async function fetchPriceChunk(
  chunk: string[],
  onDate: string,
  signal: AbortSignal | undefined,
  retries = 3,
): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiClient.get('/bc/custom/v3/item-prices', {
        params: { on_date: onDate, product_nos: chunk.join(',') },
        signal,
      });
      return extractList<Record<string, unknown>>(res.data);
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
      const status = err instanceof ApiError ? err.status : undefined;
      if ((status === 502 || status === 503) && attempt < retries) {
        await new Promise<void>((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 4000)));
        continue;
      }
      return [];
    }
  }
  return [];
}

function mapItemRow(row: Record<string, unknown>): Item {
  const number = (row['productNo'] ?? '') as string;
  return {
    id:                   (row['systemId'] ?? row['id'] ?? number) as string,
    number,
    displayName:          (row['displayName'] ?? row['description'] ?? number) as string,
    description:          (row['description'] ?? row['displayName'] ?? '') as string,
    type:                 (row['type'] ?? '') as string,
    itemCategoryId:       (row['itemCategoryId'] ?? '') as string,
    itemCategoryCode:     (row['itemCategoryCode'] ?? '') as string,
    familyCode:           (row['familyCode'] as string | undefined) ?? undefined,
    baseUnitOfMeasure:    (row['baseUnitOfMeasure'] ?? row['baseUnitOfMeasureCode'] ?? '') as string,
    unitPriceIncVAT:      (row['unitPriceIncVAT'] ?? row['unitPrice'] ?? row['unit_price'] ?? 0) as number,
    priceListCode:        (row['priceListCode'] as string | undefined) ?? undefined,
    lastModifiedDateTime: (row['lastModifiedDateTime'] ?? '') as string,
  };
}

export const ApiService = {
  async getCompanies(): Promise<Company[]> {
    const RETRIES = 6;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v2/company-settings', { timeout: 180_000 });
        const raw = extractList<Record<string, unknown>>(res.data);
        return raw
          .filter((c) => c['consignmentAppVisible'] === true)
          .map((c) => ({
            id:                   (c['id']                   ?? '') as string,
            code:                 (c['code'] ?? c['companyName'] ?? c['name'] ?? '') as string,
            name:                 (c['name'] ?? c['companyName'] ?? '') as string,
            displayName:          (c['displayName']          ?? '') as string,
            consignmentAppVisible: c['consignmentAppVisible'] as boolean | undefined,
          }));
      } catch (err) {
        const status = err instanceof ApiError ? err.status : undefined;
        // Retry on: no HTTP status (cancelled/network/timeout), 429, or any 5xx.
        // Throw immediately on genuine client errors (400, 401, 403, 404, etc.).
        const shouldRetry = !status || status === 429 || status >= 500;
        if (shouldRetry && attempt < RETRIES) {
          lastErr = err;
          // Cancelled/network errors retry quickly; rate-limit/server errors use backoff.
          const delay = !status ? 2000 : Math.min(4000 * 2 ** attempt, 60_000);
          await new Promise<void>((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  },

  async getBrands(company?: string): Promise<Brand[]> {
    const res = await apiClient.get('/bc/brands', {
      params: company ? { company } : undefined,
    });
    return extractList<Brand>(res.data);
  },

  async getContacts(timeout?: number): Promise<Contact[]> {
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v2/contacts', { timeout });
        const raw = extractList<Record<string, unknown>>(res.data);
        return raw.map((c) => ({
          ...c,
          id:                 (c['id']                                                                          ?? '') as string,
          number:             (c['number']           ?? c['companyNo']                                          ?? '') as string,
          type:               (c['type']                                                                        ?? '') as string,
          displayName:        (c['displayName']       ?? c['name']                                              ?? '') as string,
          jobTitle:           (c['jobTitle']                                                                    ?? '') as string,
          companyNumber:      (c['companyNumber']     ?? c['companyNo']                                         ?? '') as string,
          companyName:        (c['companyName']                                                                 ?? '') as string,
          phoneNumber:        (c['phoneNumber']       ?? c['phoneNo']                                           ?? '') as string,
          mobilePhoneNumber:  (c['mobilePhoneNumber'] ?? c['mobilePhoneNo']                                    ?? '') as string,
          email:              (c['email']                                                                       ?? '') as string,
          lastModifiedDateTime: (c['lastModifiedDateTime']                                                      ?? '') as string,
          username:           (c['username']          ?? c['userName']     ?? c['user_name']                    ?? undefined) as string | undefined,
          passwordHash:       (c['passwordHash']      ?? c['passwordhash'] ?? c['password_hash'] ?? c['PasswordHash'] ?? undefined) as string | undefined,
        })) as Contact[];
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 429) throw err;
        lastErr = err;
        if (attempt < RETRIES) {
          const delay = status === 429
            ? Math.min(5000 * 2 ** attempt, 30_000)
            : Math.min(3000 * 2 ** attempt, 15_000);
          await new Promise<void>((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  },

  async updateContact(id: string, data: ContactUpdatePayload): Promise<Contact> {
    const res = await apiClient.patch(`/bc/custom/v2/contacts/${id}`, data);
    return res.data as Contact;
  },

  async getContactPicture(id: string): Promise<string | null> {
    try {
      const res = await apiClient.get(`/bc/custom/v2/contacts/${id}/picture`, {
        responseType: 'blob',
      });
      if (!res.data || res.data.size === 0) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(res.data);
      });
    } catch {
      return null;
    }
  },

  async updateContactPicture(id: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await apiClient.patch(`/bc/custom/v2/contacts/${id}/picture`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async getCustomers(brandCode?: string, timeout?: number): Promise<Customer[]> {
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v2/customers', {
          params: brandCode ? { brand: brandCode } : undefined,
          timeout,
        });
        const raw = extractList<Record<string, unknown>>(res.data);
        return raw.map((c) => ({
          ...c,
          id:          (c['id']          ?? c['Id']                                         ?? '') as string,
          number:      (c['number']      ?? c['no']       ?? c['customerNo']                ?? '') as string,
          displayName: (c['name']        ?? c['displayName'] ?? c['customerName']           ?? '') as string,
          city:        (c['city']        ?? c['City']     ?? c['addressCity']               ?? '') as string,
          addressLine1:(c['addressLine1']?? c['address']  ?? c['address1']                  ?? '') as string,
          country:     (c['country']     ?? c['countryRegionCode']                          ?? '') as string,
          postalCode:  (c['postalCode']  ?? c['postCode'] ?? c['zip']                       ?? '') as string,
          currencyCode:(c['currencyCode']?? c['currency']                                   ?? '') as string,
          lastModifiedDateTime: (c['lastModifiedDateTime'] ?? '') as string,
        })) as Customer[];
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 429) throw err;
        lastErr = err;
        if (attempt < RETRIES) {
          const delay = status === 429
            ? Math.min(5000 * 2 ** attempt, 30_000)
            : Math.min(3000 * 2 ** attempt, 15_000);
          await new Promise<void>((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  },

  async getItemFamilies(timeout?: number): Promise<ItemFamily[]> {
    const res = await apiClient.get('/bc/custom/v2/item-families', { timeout });
    return extractList<ItemFamily>(res.data);
  },

  // Items and their prices are now served from the same v3 item-prices endpoint.
  // One call returns both the item catalogue and the effective prices for the given date.
  async getItemsForDate(
    date: string,
    familyCode?: string,
    signal?: AbortSignal,
    timeout?: number,
  ): Promise<{ items: Item[]; priceMap: Record<string, number> }> {
    // The backend blocks internally until the catalog is ready (up to 40 s), so a
    // single request normally succeeds on first try even from a cold start.
    // Keep 3 retries with short backoff as a safety net for genuine transient errors.
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v3/item-prices', {
          params: { on_date: date, ...(familyCode ? { family_code: familyCode } : {}) },
          signal,
          timeout: timeout ?? 120_000,
        });
        const rows = extractList<Record<string, unknown>>(res.data);
        const items: Item[] = [];
        const priceMap: Record<string, number> = {};
        const seen = new Set<string>();
        for (const row of rows) {
          const item = mapItemRow(row);
          if (!item.number || seen.has(item.number)) continue;
          seen.add(item.number);
          items.push(item);
          priceMap[item.number] = item.unitPriceIncVAT;
        }
        return { items, priceMap };
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500) throw err;
        lastErr = err;
        if (attempt < RETRIES) {
          await new Promise<void>((r) => setTimeout(r, Math.min(3000 * 2 ** attempt, 15000)));
        }
      }
    }
    throw lastErr;
  },

  async getItemsPage(
    date: string,
    familyCode?: string,
    bcOffset = 0,
    bcLimit = 0,
    signal?: AbortSignal,
    timeout?: number,
  ): Promise<{ items: Item[]; priceMap: Record<string, number>; total: number | null }> {
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v3/item-prices', {
          params: {
            on_date: date,
            ...(familyCode ? { family_code: familyCode } : {}),
            ...(bcOffset > 0 ? { bc_offset: bcOffset } : {}),
            ...(bcLimit > 0 ? { bc_limit: bcLimit } : {}),
          },
          signal,
          timeout: timeout ?? 300_000,
        });
        const body = res.data as Record<string, unknown>;
        const rows: Record<string, unknown>[] = Array.isArray(body.data)
          ? (body.data as Record<string, unknown>[])
          : extractList<Record<string, unknown>>(body);
        const total = typeof body.total === 'number' ? (body.total as number) : null;
        const items: Item[] = [];
        const priceMap: Record<string, number> = {};
        const seen = new Set<string>();
        for (const row of rows) {
          const item = mapItemRow(row);
          if (!item.number || seen.has(item.number)) continue;
          seen.add(item.number);
          items.push(item);
          priceMap[item.number] = item.unitPriceIncVAT;
        }
        return { items, priceMap, total };
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500) throw err;
        if (attempt < RETRIES) {
          lastErr = err;
          await new Promise<void>((r) => setTimeout(r, Math.min(3000 * 2 ** attempt, 15000)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  },

  async getItemPriceCount(
    date: string,
    familyCode?: string,
  ): Promise<number> {
    try {
      const res = await apiClient.get('/bc/custom/v3/item-prices/count', {
        params: {
          on_date: date,
          ...(familyCode ? { family_code: familyCode } : {}),
        },
        timeout: 60_000,
      });
      return (res.data as Record<string, unknown>).totalCount as number ?? 0;
    } catch {
      return 0;
    }
  },

  async getItemsPaged(
    date: string,
    skip: number,
    limit: number,
    signal?: AbortSignal,
    timeout?: number,
  ): Promise<{ items: Item[]; priceMap: Record<string, number>; total: number }> {
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/custom/v3/item-prices', {
          params: { on_date: date, skip, limit },
          signal,
          timeout: timeout ?? 120_000,
        });
        const body = res.data as Record<string, unknown>;
        const rows = Array.isArray(body.data)
          ? (body.data as Record<string, unknown>[])
          : extractList<Record<string, unknown>>(body);
        const total = typeof body.total === 'number' ? body.total : 0;
        const items: Item[] = [];
        const priceMap: Record<string, number> = {};
        const seen = new Set<string>();
        for (const row of rows) {
          const item = mapItemRow(row);
          if (!item.number || seen.has(item.number)) continue;
          seen.add(item.number);
          items.push(item);
          priceMap[item.number] = item.unitPriceIncVAT;
        }
        return { items, priceMap, total };
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 429) throw err;
        lastErr = err;
        if (attempt < RETRIES) {
          const delay = status === 429
            ? Math.min(5000 * 2 ** attempt, 30_000)
            : Math.min(3000 * 2 ** attempt, 15_000);
          await new Promise<void>((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  },

  async getItemCategories(timeout?: number): Promise<ItemCategory[]> {
    const RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await apiClient.get('/bc/item-categories', { timeout });
        return extractList<ItemCategory>(res.data);
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 429) throw err;
        lastErr = err;
        if (attempt < RETRIES) {
          const delay = status === 429
            ? Math.min(5000 * 2 ** attempt, 30_000)
            : Math.min(3000 * 2 ** attempt, 15_000);
          await new Promise<void>((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  },

  async getContactBrandTags(contactId: string): Promise<string[]> {
    const res = await apiClient.get(`/bc/custom/contacts/${contactId}/brand-tags`);
    const items = extractList<Record<string, unknown>>(res.data);
    return items.map((t) => t.brandCode as string).filter(Boolean);
  },

  async getActiveItemPrice(productNo: string, onDate: string): Promise<{ price: number | null; priceListCode: string | null }> {
    try {
      const res = await apiClient.get('/bc/custom/v3/item-prices', {
        params: { product_no: productNo, on_date: onDate },
      });
      const rows = extractList<Record<string, unknown>>(res.data);
      const d = rows[0];
      const raw = d?.unitPriceIncVAT ?? d?.unitPrice ?? d?.unit_price ?? d?.price;
      return {
        price: typeof raw === 'number' ? raw : null,
        priceListCode: (d?.priceListCode as string | undefined) ?? null,
      };
    } catch {
      return { price: null, priceListCode: null };
    }
  },

  async getAllItemPricesForDate(
    onDate: string,
    productNos: string[],
    signal?: AbortSignal,
    onChunkDone?: () => void,
    familyCode?: string,
  ): Promise<Record<string, number>> {
    const buildMap = (rows: Record<string, unknown>[]): Record<string, number> => {
      const map: Record<string, number> = {};
      for (const row of rows) {
        const no = row['productNo'] as string | undefined;
        const price = (row['unitPriceIncVAT'] ?? row['unitPrice'] ?? row['unit_price']) as number | undefined;
        if (no && typeof price === 'number' && !(no in map)) map[no] = price;
      }
      return map;
    };

    // Fast path: single call — backend filters from its in-memory full-catalog cache.
    // On a cold backend start the cache may not be warm yet, so the backend fetches the
    // full BC catalog synchronously before filtering; allow 5 min for that one-time cost.
    if (familyCode) {
      try {
        const res = await apiClient.get('/bc/custom/v3/item-prices', {
          params: { on_date: onDate, family_code: familyCode },
          signal,
          timeout: 300000,
        });
        onChunkDone?.();
        return buildMap(extractList<Record<string, unknown>>(res.data));
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) throw err;
        return {};
      }
    }

    if (!productNos.length) return {};
    // Chunk into batches of 150 — item numbers are short (≤15 chars) so 150 per request
    // stays well within BC's URL length limit while reducing round-trip count 3×.
    const CHUNK = 150;
    const chunks: string[][] = [];
    for (let i = 0; i < productNos.length; i += CHUNK) {
      chunks.push(productNos.slice(i, i + CHUNK));
    }
    // Three concurrent chunks at a time — BC allows up to ~6 concurrent tenant requests;
    // 3 gives good throughput without crowding out other in-flight calls.
    const CONCURRENCY = 3;
    const allRows: Record<string, unknown>[] = [];
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const rows = (
        await Promise.all(
          batch.map((chunk) =>
            fetchPriceChunk(chunk, onDate, signal).then((r) => { onChunkDone?.(); return r; }),
          ),
        )
      ).flat();
      allRows.push(...rows);
    }
    return buildMap(allRows);
  },

  async getApiStatus(company?: string): Promise<{ warming_up: boolean; active_bc_requests: number; busy: boolean }> {
    try {
      const res = await apiClient.get('/bc/status', {
        params: company ? { company } : undefined,
        timeout: 5000,
      });
      return res.data;
    } catch {
      return { warming_up: false, active_bc_requests: 0, busy: false };
    }
  },

  async submitSalesOrder(payload: SalesOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/sales-orders', payload, { timeout: 180_000 });
    return res.data;
  },

  async submitSalesReturnOrder(payload: SalesReturnOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/custom/v2/sales-return-orders', payload, { timeout: 180_000 });
    return res.data;
  },

  async getBCSalesOrders(date: string): Promise<unknown> {
    const res = await apiClient.get('/bc/sales-orders', { params: { filter: `postingDate eq ${date}` } });
    return res.data;
  },

  async getBCSalesReturnOrders(date: string): Promise<unknown> {
    const res = await apiClient.get('/bc/custom/v2/sales-return-orders', { params: { filter: `postingDate eq ${date}` } });
    return res.data;
  },

  async getBCSalesOrderLines(orderId: string): Promise<unknown> {
    const res = await apiClient.get(`/bc/sales-orders/${orderId}/lines`);
    return res.data;
  },

  async getBCSalesReturnOrderLines(orderId: string): Promise<unknown> {
    const res = await apiClient.get(`/bc/custom/v2/sales-return-orders/${orderId}/lines`);
    return res.data;
  },
};
