import axios from 'axios';
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
 * Selected company name — set once at login and restored on startup.
 * The request interceptor below injects it as `?company=<name>` on every
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
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
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
    return extractList<Item>(res.data);
  },

  async getItemCategories(): Promise<ItemCategory[]> {
    const res = await apiClient.get('/bc/item-categories');
    return extractList<ItemCategory>(res.data);
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
