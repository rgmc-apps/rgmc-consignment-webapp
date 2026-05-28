import axios from 'axios';
import type {
  Brand,
  Contact,
  Customer,
  Item,
  ItemCategory,
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
  async getBrands(): Promise<Brand[]> {
    const res = await apiClient.get('/bc/brands');
    return extractList<Brand>(res.data);
  },

  async getContacts(): Promise<Contact[]> {
    const res = await apiClient.get('/bc/contacts');
    return extractList<Contact>(res.data);
  },

  async getCustomers(): Promise<Customer[]> {
    const res = await apiClient.get('/bc/customers');
    return extractList<Customer>(res.data);
  },

  async getItems(): Promise<Item[]> {
    const res = await apiClient.get('/bc/items');
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
