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
  timeout: 60000,
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
  (response) => {
    /* Debug: log every list-endpoint response shape so we can confirm
       the { data: [] } vs { value: [] } vs bare-array format in DevTools. */
    if (response.config.url?.startsWith('/bc/')) {
      const body = response.data;
      console.info(
        `[API] ${response.config.method?.toUpperCase()} ${response.config.url}`,
        `status=${response.status}`,
        Array.isArray(body)
          ? `→ bare array, length=${body.length}`
          : `→ keys=${Object.keys(body ?? {}).join(', ')}`,
        body,
      );
    }
    return response;
  },
  (error) => {
    const message: string =
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
  console.warn('[API] extractList: unexpected response shape', body);
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
      console.warn(`[API] price chunk failed after ${attempt + 1} attempt(s):`, err);
      return [];
    }
  }
  return [];
}

export const ApiService = {
  async getCompanies(): Promise<Company[]> {
    const res = await apiClient.get('/bc/custom/v2/company-settings');
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
  },

  async getBrands(company?: string): Promise<Brand[]> {
    const res = await apiClient.get('/bc/brands', {
      params: company ? { company } : undefined,
    });
    return extractList<Brand>(res.data);
  },

  async getContacts(timeout?: number): Promise<Contact[]> {
    const res = await apiClient.get('/bc/custom/v2/contacts', { timeout });
    const raw = extractList<Record<string, unknown>>(res.data);
    // Normalise field-name variations the BC API may return
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
  },

  async getItemFamilies(timeout?: number): Promise<ItemFamily[]> {
    const res = await apiClient.get('/bc/custom/v2/item-families', { timeout });
    return extractList<ItemFamily>(res.data);
  },

  async getItems(familyCode?: string, timeout?: number): Promise<Item[]> {
    const res = await apiClient.get('/bc/custom/v2/items', {
      params: familyCode ? { family_code: familyCode } : undefined,
      timeout,
    });
    const raw = extractList<Record<string, unknown>>(res.data);
    return raw.map((i) => ({
      ...i,
      displayName:    (i['displayName']    ?? i['description'] ?? i['number']     ?? '')  as string,
      unitPriceIncVAT:(i['unitPriceIncVAT']?? i['unitPrice']   ?? i['unit_price'] ?? 0)   as number,
    })) as Item[];
  },

  async getItemCategories(timeout?: number): Promise<ItemCategory[]> {
    const res = await apiClient.get('/bc/item-categories', { timeout });
    return extractList<ItemCategory>(res.data);
  },

  async getContactBrandTags(contactId: string): Promise<string[]> {
    const res = await apiClient.get(`/bc/custom/contacts/${contactId}/brand-tags`);
    const items = extractList<Record<string, unknown>>(res.data);
    return items.map((t) => t.brandCode as string).filter(Boolean);
  },

  async getActiveItemPrice(productNo: string, onDate: string): Promise<number | null> {
    try {
      const res = await apiClient.get('/bc/custom/v3/item-prices', {
        params: { product_no: productNo, on_date: onDate },
      });
      const rows = extractList<Record<string, unknown>>(res.data);
      const d = rows[0];
      const price = d?.unitPriceIncVAT ?? d?.unitPrice ?? d?.unit_price ?? d?.price;
      return typeof price === 'number' ? price : null;
    } catch {
      return null;
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
        console.warn('[API] familyCode price fetch failed:', err);
        return {};
      }
    }

    if (!productNos.length) return {};
    // Chunk into batches of 50 to stay well under BC's URL length limit.
    const CHUNK = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < productNos.length; i += CHUNK) {
      chunks.push(productNos.slice(i, i + CHUNK));
    }
    // Two concurrent chunks at a time — conservative enough to stay clear of BC's
    // per-tenant concurrency limit while still overlapping round-trip latency.
    const CONCURRENCY = 2;
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

  async submitSalesOrder(payload: SalesOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/sales-orders', payload);
    return res.data;
  },

  async submitSalesReturnOrder(payload: SalesReturnOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/custom/v2/sales-return-orders', payload);
    return res.data;
  },
};
