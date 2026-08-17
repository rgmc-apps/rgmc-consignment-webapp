export interface Company {
  id: string;
  code: string;
  name: string;
  displayName: string;
  consignmentAppVisible?: boolean;
}

export interface Brand {
  id: string;
  code: string;
  dimensionId: string;
  displayName: string;
  consolidationCode: string;
  lastModifiedDateTime: string;
  itemFamilyCode?: string;
}

export interface ItemFamily {
  id: string;
  code: string;
  description: string;
}

export interface Contact {
  id: string;
  number: string;
  type: string;
  displayName: string;
  jobTitle: string;
  companyNumber: string;
  companyName: string;
  phoneNumber: string;
  mobilePhoneNumber: string;
  email: string;
  lastModifiedDateTime: string;
  username?: string;
  passwordHash?: string;
}

export interface Customer {
  id: string;
  number: string;
  displayName: string;
  type: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode: string;
  phoneNumber?: string;
  email?: string;
  balanceDue: number;
  creditLimit: number;
  taxLiable?: boolean;
  taxAreaDisplayName?: string;
  taxRegistrationNumber?: string;
  currencyCode: string;
  blocked?: string;
  lastModifiedDateTime: string;
}

export interface Item {
  id: string;
  number: string;
  displayName: string;
  description: string;
  type: string;
  itemCategoryId: string;
  itemCategoryCode: string;
  familyCode?: string;
  baseUnitOfMeasure: string;
  unitPriceIncVAT: number;
  priceListCode?: string;
  lastModifiedDateTime: string;
}

export interface ItemCategory {
  id: string;
  code: string;
  displayName: string;
  lastModifiedDateTime: string;
}

export type DiscountType = 'percent' | 'amount';
export type SessionStatus = 'draft' | 'submitted' | 'failed';

export interface OrderLine {
  id: string;
  itemNumber: string;
  itemName: string;
  description: string;
  categoryCode?: string;
  srp: number;
  priceListCode?: string;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
  totalAmount: number;
}

export interface ScanSession {
  id: string;
  brand: Pick<Brand, 'id' | 'code' | 'displayName'>;
  companyCode?: string;
  user: { displayName: string };
  customer: Customer | null;
  postingDate?: string;
  noSales?: boolean;
  salesOrders: OrderLine[];
  returnOrders: OrderLine[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  status: SessionStatus;
  salesOrderSeries?: string;
  returnOrderSeries?: string;
  errorMessage?: string;
}

export interface ContactUpdatePayload {
  username?: string;
  passwordHash?: string;
  displayName?: string;
  jobTitle?: string;
  companyName?: string;
  phoneNumber?: string;
  mobilePhoneNumber?: string;
  email?: string;
}

export interface AuthSession {
  brand: Brand;
  user: Contact;
  company?: Company;
}

/** Per-company-brand sync record (what gets stored at each map entry). */
export interface SyncTimestampEntry {
  customers?: string;
  items?: string;
  itemCategories?: string;
  contacts?: string;
}

/** Full map stored in localStorage — keyed by "companyCode::brandCode". */
export type SyncTimestamps = Record<string, SyncTimestampEntry>;

export interface SalesOrderLine {
  itemNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  lineDiscountAmount?: number;
}

export interface SalesOrderPayload {
  customerNumber: string;
  postingDate?: string;
  externalDocumentNumber?: string;
  submittedBy?: string;
  lines: SalesOrderLine[];
}

export interface SalesReturnOrderPayload {
  customerNumber: string;
  postingDate?: string;
  externalDocumentNo?: string;
  yourReference?: string;
  submittedBy?: string;
  lines: SalesOrderLine[];
}

export interface PriceListHeader {
  id: string;
  code: string;
  description: string;
  status: string;
  priceType: string;
  startingDate: string;
  endingDate: string;
  itemFamilyCode?: string;
  amountType?: string;
  currencyCode?: string;
  company?: string;
}

export interface ApiListResponse<T> {
  data: T[];
}
