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

/* In dev the Vite proxy rewrites /bc/* → GCP API, avoiding CORS.
   In production set VITE_API_BASE_URL to the GCP origin (or a same-origin proxy). */
const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string) || '';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/*
 * Selected company — set once at login and restored on startup.
 * The request interceptor injects ?company=<name> on every /bc/ call.
 * _companyId is used to build v2 BC API paths that embed the company.
 */
let _companyName: string | null = null;
let _companyId: string | null = null;

export function setApiCompany(company: { name: string; id: string } | null): void {
  _companyName = company?.name ?? null;
  _companyId   = company?.id   ?? null;
}

function itemPricesV2(suffix = ''): string {
  return `/api/rgmc/rgmccustom/v2.0/companies(${_companyId})/itemPrices${suffix}`;
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

export const ApiService = {
  async getCompanies(): Promise<Company[]> {
    const res = await apiClient.get('/bc/companies');
    return extractList<Company>(res.data);
  },

  async getBrands(): Promise<Brand[]> {
    const res = await apiClient.get('/bc/brands');
    return extractList<Brand>(res.data);
  },

  async getContacts(): Promise<Contact[]> {
    const res = await apiClient.get('/bc/custom/contacts');
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
    const res = await apiClient.patch(`/bc/custom/contacts/${id}`, data);
    return res.data as Contact;
  },

  async getContactPicture(id: string): Promise<string | null> {
    try {
      const res = await apiClient.get(`/bc/custom/contacts/${id}/picture`, {
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
    await apiClient.patch(`/bc/custom/contacts/${id}/picture`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async getCustomers(): Promise<Customer[]> {
    const res = await apiClient.get('/bc/customers');
    return extractList<Customer>(res.data);
  },

  async getItemFamilies(): Promise<ItemFamily[]> {
    const res = await apiClient.get('/bc/custom/item-families');
    return extractList<ItemFamily>(res.data);
  },

  async getItems(): Promise<Item[]> {
    const res = await apiClient.get('/bc/custom/items');
    const raw = extractList<Record<string, unknown>>(res.data);
    return raw.map((i) => ({
      ...i,
      displayName: (i['displayName'] ?? i['description'] ?? i['number'] ?? '') as string,
    })) as Item[];
  },

  async getItemCategories(): Promise<ItemCategory[]> {
    const res = await apiClient.get('/bc/item-categories');
    return extractList<ItemCategory>(res.data);
  },

  async getContactBrandTags(contactId: string): Promise<string[]> {
    const res = await apiClient.get(`/bc/custom/contacts/${contactId}/brand-tags`);
    const items = extractList<Record<string, unknown>>(res.data);
    return items.map((t) => t.brandCode as string).filter(Boolean);
  },

  async getActiveItemPrice(productNo: string, onDate: string): Promise<number | null> {
    try {
      const res = await apiClient.get(itemPricesV2('/active'), {
        params: { product_no: productNo, on_date: onDate },
      });
      const d = res.data as Record<string, unknown>;
      const price = d?.unitPriceIncVAT ?? d?.unitPrice ?? d?.unit_price ?? d?.price;
      return typeof price === 'number' ? price : null;
    } catch {
      return null;
    }
  },

  async updateCachedItemPrice(productNo: string, unitPrice: number, onDate?: string): Promise<void> {
    const params: Record<string, string> = { product_no: productNo };
    if (onDate) params['on_date'] = onDate;
    await apiClient.patch(itemPricesV2('/cache'), { unitPriceIncVAT: unitPrice }, { params });
  },

  async getAllItemPricesForDate(onDate: string): Promise<Record<string, number>> {
    const res = await apiClient.get(itemPricesV2(), {
      params: { on_date: onDate },
    });
    const rows = extractList<Record<string, unknown>>(res.data);
    const map: Record<string, number> = {};
    for (const row of rows) {
      const no = row['productNo'] as string | undefined;
      const price = (row['unitPriceIncVAT'] ?? row['unitPrice'] ?? row['unit_price']) as number | undefined;
      if (no && typeof price === 'number' && !(no in map)) {
        map[no] = price;
      }
    }
    return map;
  },

  async submitSalesOrder(payload: SalesOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/sales-orders', payload);
    return res.data;
  },

  async submitSalesReturnOrder(payload: SalesReturnOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/custom/sales-return-orders', payload);
    return res.data;
  },
};
