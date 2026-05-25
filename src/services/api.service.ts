import axios from 'axios';
import type {
  Brand,
  Contact,
  Customer,
  Item,
  ItemCategory,
  SalesOrderPayload,
  SalesReturnOrderPayload,
  ApiListResponse,
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
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  },
);

export const ApiService = {
  async getBrands(): Promise<Brand[]> {
    const res = await apiClient.get<ApiListResponse<Brand>>('/bc/brands');
    return res.data.data;
  },

  async getContacts(): Promise<Contact[]> {
    const res = await apiClient.get<ApiListResponse<Contact>>('/bc/contacts');
    return res.data.data;
  },

  async getCustomers(): Promise<Customer[]> {
    const res = await apiClient.get<ApiListResponse<Customer>>('/bc/customers');
    return res.data.data;
  },

  async getItems(): Promise<Item[]> {
    const res = await apiClient.get<ApiListResponse<Item>>('/bc/items');
    return res.data.data;
  },

  async getItemCategories(): Promise<ItemCategory[]> {
    const res = await apiClient.get<ApiListResponse<ItemCategory>>('/bc/item-categories');
    return res.data.data;
  },

  async submitSalesOrder(payload: SalesOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/sales-orders', payload);
    return res.data;
  },

  async submitSalesReturnOrder(payload: SalesReturnOrderPayload): Promise<unknown> {
    const res = await apiClient.post('/bc/sales-return-orders', payload);
    return res.data;
  },
};
