const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8102';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

// ── Mock data ─────────────────────────────────────────────────────────────────
const BRANDS = [
  { id: 'b1', code: 'AAE', dimensionId: 'd1', displayName: 'APPLE & EVE', consolidationCode: 'AAE', lastModifiedDateTime: '' },
  { id: 'b2', code: 'DOLE', dimensionId: 'd2', displayName: 'DOLE', consolidationCode: 'DOLE', lastModifiedDateTime: '' },
];
const CONTACTS = [
  { id: 'u1', number: 'U001', type: 'Person', displayName: 'ERWIN ARELLANO', jobTitle: 'Sales Agent', companyNumber: 'RGMC', companyName: 'RGMC Group', phoneNumber: '09123456789', mobilePhoneNumber: '', email: '', lastModifiedDateTime: '' },
];
const CUSTOMERS = [
  { id: 'c1', number: 'C001', displayName: 'SM SUPERMARKET APPLE MANILA', type: 'Company', addressLine1: '123 Mall Dr', city: 'Manila', country: 'PH', postalCode: '1000', currencyCode: 'PHP', balanceDue: 0, creditLimit: 500000, lastModifiedDateTime: '' },
  { id: 'c2', number: 'C002', displayName: 'ROBINSONS APPLE BGC', type: 'Company', addressLine1: '456 Mall Ave', city: 'Taguig', country: 'PH', postalCode: '1634', currencyCode: 'PHP', balanceDue: 0, creditLimit: 300000, lastModifiedDateTime: '' },
  { id: 'c3', number: 'C003', displayName: 'PUREGOLD APPLE PASIG', type: 'Company', addressLine1: '789 Retail Rd', city: 'Pasig', country: 'PH', postalCode: '1600', currencyCode: 'PHP', balanceDue: 0, creditLimit: 200000, lastModifiedDateTime: '' },
  { id: 'c4', number: 'C004', displayName: 'WALTERMART APPLE QC', type: 'Company', addressLine1: '101 WM Blvd', city: 'Quezon City', country: 'PH', postalCode: '1100', currencyCode: 'PHP', balanceDue: 0, creditLimit: 150000, lastModifiedDateTime: '' },
  { id: 'c5', number: 'C005', displayName: 'SAVEMORE APPLE MANDALUYONG', type: 'Company', addressLine1: '202 Shaw Blvd', city: 'Mandaluyong', country: 'PH', postalCode: '1550', currencyCode: 'PHP', balanceDue: 0, creditLimit: 100000, lastModifiedDateTime: '' },
];
const CATEGORIES = [
  { id: 'cat1', code: 'JUICE', displayName: 'Juices', lastModifiedDateTime: '' },
  { id: 'cat2', code: 'WATER', displayName: 'Water', lastModifiedDateTime: '' },
];
const ITEMS = [
  { id: 'i1', number: 'AAE-001', displayName: 'Apple Juice 1L', description: 'Apple & Eve Premium Tetra Pak', type: 'Inventory', itemCategoryId: 'cat1', itemCategoryCode: 'JUICE', baseUnitOfMeasure: 'PCS', unitPrice: 89.50, lastModifiedDateTime: '' },
  { id: 'i2', number: 'AAE-002', displayName: 'Grape Juice 1L', description: 'Apple & Eve Grape Juice Tetra Pak', type: 'Inventory', itemCategoryId: 'cat1', itemCategoryCode: 'JUICE', baseUnitOfMeasure: 'PCS', unitPrice: 94.75, lastModifiedDateTime: '' },
  { id: 'i3', number: 'AAE-003', displayName: 'Cranberry Cocktail 1.89L', description: 'Apple & Eve Cranberry Cocktail', type: 'Inventory', itemCategoryId: 'cat1', itemCategoryCode: 'JUICE', baseUnitOfMeasure: 'PCS', unitPrice: 175.00, lastModifiedDateTime: '' },
  { id: 'i4', number: 'AAE-004', displayName: 'Apple Juice 250ml 6-Pack', description: 'Apple & Eve Mini Pack', type: 'Inventory', itemCategoryId: 'cat1', itemCategoryCode: 'JUICE', baseUnitOfMeasure: 'PCS', unitPrice: 145.00, lastModifiedDateTime: '' },
];
const MOCK_AUTH = { brand: BRANDS[0], user: CONTACTS[0] };
const MOCK_DRAFT = {
  id: 'draft-001', brand: BRANDS[0], user: { displayName: CONTACTS[0].displayName }, customer: CUSTOMERS[0],
  salesOrders: [
    { id: 'sl1', itemId: 'i1', itemNumber: 'AAE-001', itemName: 'Apple Juice 1L', description: 'Apple & Eve Premium Tetra Pak', srp: 89.50, quantity: 12, discountType: 'percent', discountValue: 5, totalAmount: 1020.30 },
    { id: 'sl2', itemId: 'i2', itemNumber: 'AAE-002', itemName: 'Grape Juice 1L', description: 'Apple & Eve Grape Juice Tetra Pak', srp: 94.75, quantity: 6, discountType: 'amount', discountValue: 50, totalAmount: 518.50 },
  ],
  returnOrders: [
    { id: 'rl1', itemId: 'i3', itemNumber: 'AAE-003', itemName: 'Cranberry Cocktail 1.89L', description: 'Apple & Eve Cranberry Cocktail', srp: 175.00, quantity: 2, discountType: 'percent', discountValue: 0, totalAmount: 350.00 },
  ],
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  updatedAt: new Date().toISOString(), status: 'draft',
};
const MOCK_SESSIONS = [
  {
    id: 'sess-001', brand: BRANDS[0], user: { displayName: CONTACTS[0].displayName }, customer: CUSTOMERS[0],
    salesOrders: [
      { id: 'hl1', itemId: 'i1', itemNumber: 'AAE-001', itemName: 'Apple Juice 1L', description: '', srp: 89.50, quantity: 24, discountType: 'percent', discountValue: 10, totalAmount: 1933.20 },
      { id: 'hl2', itemId: 'i4', itemNumber: 'AAE-004', itemName: 'Apple Juice 250ml 6-Pack', description: '', srp: 145.00, quantity: 10, discountType: 'percent', discountValue: 5, totalAmount: 1377.50 },
    ],
    returnOrders: [],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2 + 600000).toISOString(),
    submittedAt: new Date(Date.now() - 86400000 * 2 + 600000).toISOString(),
    status: 'submitted', salesOrderSeries: 'SO-2026-00421',
  },
  {
    id: 'sess-002', brand: BRANDS[0], user: { displayName: CONTACTS[0].displayName }, customer: CUSTOMERS[1],
    salesOrders: [
      { id: 'hl3', itemId: 'i2', itemNumber: 'AAE-002', itemName: 'Grape Juice 1L', description: '', srp: 94.75, quantity: 12, discountType: 'percent', discountValue: 5, totalAmount: 1080.15 },
    ],
    returnOrders: [
      { id: 'hl4', itemId: 'i3', itemNumber: 'AAE-003', itemName: 'Cranberry Cocktail 1.89L', description: '', srp: 175.00, quantity: 3, discountType: 'percent', discountValue: 0, totalAmount: 525.00 },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'failed', errorMessage: 'Network error: Request timed out. Please retry when connection is stable.',
  },
];

async function mockApi(page) {
  await page.route('**/bc/**', r => {
    const url = r.request().url();
    if (url.includes('brands'))          return r.fulfill({ json: { data: BRANDS } });
    if (url.includes('contacts'))        return r.fulfill({ json: { data: CONTACTS } });
    if (url.includes('customers'))       return r.fulfill({ json: { data: CUSTOMERS } });
    if (url.includes('item-categories')) return r.fulfill({ json: { data: CATEGORIES } });
    if (url.includes('items'))           return r.fulfill({ json: { data: ITEMS } });
    if (url.includes('sales-return'))    return r.fulfill({ json: { data: { number: 'SRO-2026-00088' } } });
    if (url.includes('sales-orders'))    return r.fulfill({ json: { data: { number: 'SO-2026-00422' } } });
    return r.continue();
  });
}

async function injectStorage(page) {
  await page.evaluate((d) => {
    localStorage.setItem('rgmc_auth',                  JSON.stringify(d.auth));
    localStorage.setItem('rgmc_cache_brands',          JSON.stringify(d.brands));
    localStorage.setItem('rgmc_cache_contacts',        JSON.stringify(d.contacts));
    localStorage.setItem('rgmc_cache_customers',       JSON.stringify(d.customers));
    localStorage.setItem('rgmc_cache_items',           JSON.stringify(d.items));
    localStorage.setItem('rgmc_cache_item_categories', JSON.stringify(d.cats));
    localStorage.setItem('rgmc_sync_timestamps',       JSON.stringify({ customers: new Date().toISOString(), items: new Date().toISOString(), itemCategories: new Date().toISOString() }));
    localStorage.setItem('rgmc_drafts',                JSON.stringify(d.drafts));
    localStorage.setItem('rgmc_sessions',              JSON.stringify(d.sessions));
  }, { auth: MOCK_AUTH, brands: BRANDS, contacts: CONTACTS, customers: CUSTOMERS, items: ITEMS, cats: CATEGORIES, drafts: [MOCK_DRAFT], sessions: MOCK_SESSIONS });
}

// Navigate within the running SPA via Vue Router (avoids full-page-reload auth guard race)
async function routerPush(page, route) {
  await page.evaluate((r) => {
    const appEl = document.getElementById('app');
    const router = appEl?.__vue_app__?.config?.globalProperties?.$router;
    if (router) router.push(r);
    else window.location.href = r;
  }, route);
  await page.waitForTimeout(1000);
  console.log(`  → ${route}  (url: ${page.url()})`);
}

async function shot(page, name, label) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png  — ${label}`);
}

// Boot: splash → /login → inject auth → goto /app/home (succeeds via splash redirect)
async function boot(browser, opts) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  await mockApi(p);
  // Let splash run with mocked APIs → redirects to /login
  await p.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded' });
  await p.waitForURL(`**/login`, { timeout: 10000 }).catch(() => {});
  // Inject auth while on /login (correct origin)
  await injectStorage(p);
  // Now navigate — will go to /splash → loadFromStorage → splash detects auth → /app/home
  await p.goto(`${BASE}/app/home`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  console.log(`  boot complete, url: ${p.url()}`);
  return { p, ctx };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
  const desk   = { viewport: { width: 1280, height: 800 } };

  // ── 01 SPLASH ─────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(mobile);
    const p = await ctx.newPage();
    await mockApi(p);
    await p.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(450);
    await shot(p, '01-splash', 'Splash — loading brands + contacts with progress bar');
    await ctx.close();
  }

  // ── 02 LOGIN ──────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(mobile);
    const p = await ctx.newPage();
    await mockApi(p);
    await p.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(`**/login`, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(600);
    await shot(p, '02-login', 'Login — brand dropdown, username, password');
    await ctx.close();
  }

  // ── MOBILE AUTHENTICATED SESSION ──────────────────────────────────────────
  const { p: mp, ctx: mCtx } = await boot(browser, mobile);

  // 03 Landing
  await shot(mp, '03-landing', 'Landing — welcome, draft session, customer list, tab bar');

  // 04 Scanning (router push within running SPA)
  await routerPush(mp, '/app/scan');
  await shot(mp, '04-scanning-form', 'Scanning — customer selector, item form, discount, total');

  // 05 Scanning scrolled to order lists
  await mp.evaluate(() => {
    document.querySelector('ion-content')?.scrollToBottom(0);
  });
  await mp.waitForTimeout(700);
  await shot(mp, '05-scanning-lists', 'Scanning — sales order lines, return lines, submit bar');

  // 06 History
  await routerPush(mp, '/app/history');
  await shot(mp, '06-history', 'History — filter chips, submitted + failed sessions');

  // 07 History detail modal
  try {
    await mp.locator('ion-list ion-item').first().click({ timeout: 4000 });
    await mp.waitForTimeout(1000);
    await shot(mp, '07-history-detail', 'History detail — line items, series number, grand total');
    await mp.keyboard.press('Escape');
    await mp.waitForTimeout(500);
  } catch (e) {
    console.log('  (detail modal skipped)');
  }

  // 08 Submit
  await routerPush(mp, '/app/submit');
  await shot(mp, '08-submit', 'Submit — order line review, submit buttons, status');

  await mCtx.close();

  // ── DESKTOP AUTHENTICATED SESSION ─────────────────────────────────────────
  const { p: dp, ctx: dCtx } = await boot(browser, desk);

  await dp.screenshot({ path: path.join(OUT, '09-landing-desktop.png') });
  console.log('✓ 09-landing-desktop.png  — Landing (1280px)');

  await routerPush(dp, '/app/scan');
  await dp.screenshot({ path: path.join(OUT, '10-scanning-desktop.png') });
  console.log('✓ 10-scanning-desktop.png  — Scanning (1280px)');

  await routerPush(dp, '/app/history');
  await dp.screenshot({ path: path.join(OUT, '11-history-desktop.png') });
  console.log('✓ 11-history-desktop.png  — History (1280px)');

  await dCtx.close();
  await browser.close();
  console.log(`\nDone — ${OUT}`);
})();
