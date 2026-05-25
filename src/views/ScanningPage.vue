<template>
  <ion-page>
    <!-- ── Header ── -->
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <div class="header-title">
            <img src="/static/cons-logo.png" alt="logo" class="header-logo" />
            <span>{{ authStore.brand?.displayName ?? 'Scan' }}</span>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" :disabled="isSyncing" @click="handleSync">
            <ion-icon :icon="isSyncing ? hourglassOutline : syncOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Sync info sub-bar -->
      <ion-toolbar class="sync-bar">
        <div class="sync-bar-inner">
          <span class="sync-info-text">
            <ion-icon :icon="timeOutline" />
            {{ lastSyncLabel }}
          </span>
          <span class="sync-today">{{ todayLabel }}</span>
        </div>
      </ion-toolbar>
    </ion-header>

    <!-- ── Content ── -->
    <ion-content :scroll-events="true">

      <!-- No cache state -->
      <div v-if="!hasCache && !isSyncing" class="state-card">
        <ion-icon :icon="cloudDownloadOutline" color="medium" />
        <p>Data not loaded yet.</p>
        <p class="state-sub">Tap Sync to download customers and items before scanning.</p>
        <ion-button @click="handleSync">
          <ion-icon :icon="syncOutline" slot="start" />
          Sync Now
        </ion-button>
      </div>

      <!-- Syncing state -->
      <div v-else-if="isSyncing" class="state-card">
        <ion-spinner name="crescent" />
        <p>Syncing data…</p>
        <p class="state-sub">This may take a moment for large item lists.</p>
      </div>

      <!-- Sync error -->
      <div v-if="syncError" class="sync-err-banner">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <span>{{ syncError }}</span>
      </div>

      <template v-if="hasCache">
        <!-- ══ Customer Card ══ -->
        <ion-card class="form-card">
          <ion-card-content>
            <p class="field-label">CUSTOMER</p>
            <div class="customer-tap" @click="showCustomerModal = true">
              <div v-if="selectedCustomer" class="customer-info">
                <p class="cust-name">{{ selectedCustomer.displayName }}</p>
                <p class="cust-sub">{{ selectedCustomer.number }} &bull; {{ selectedCustomer.city }}</p>
              </div>
              <p v-else class="cust-placeholder">Tap to select customer…</p>
              <ion-icon :icon="chevronDownOutline" color="medium" />
            </div>
          </ion-card-content>
        </ion-card>

        <!-- ══ Item Form Card ══ -->
        <ion-card class="form-card">
          <ion-card-content class="item-form-body">
            <p class="field-label">ADD ITEM</p>

            <!-- Item Category -->
            <ion-item lines="inset" class="form-row">
              <ion-label>Category</ion-label>
              <ion-select
                v-model="form.categoryCode"
                placeholder="All categories"
                interface="popover"
                class="form-select"
              >
                <ion-select-option value="">All categories</ion-select-option>
                <ion-select-option
                  v-for="cat in categories"
                  :key="cat.code"
                  :value="cat.code"
                >{{ cat.displayName }}</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Item selector trigger -->
            <ion-item lines="inset" button :detail="false" class="form-row" @click="showItemModal = true">
              <ion-label>Item</ion-label>
              <div slot="end" class="item-trigger-end">
                <span v-if="form.itemName" class="item-trigger-name">{{ form.itemName }}</span>
                <span v-else class="item-trigger-placeholder">Select or scan</span>
                <ion-icon :icon="barcodeOutline" color="primary" />
              </div>
            </ion-item>

            <!-- Fields below only visible once item is selected -->
            <template v-if="form.itemId">
              <!-- Description -->
              <ion-item lines="inset" class="form-row form-row--readonly">
                <ion-label>Description</ion-label>
                <ion-note slot="end" class="readonly-val">{{ form.description || '—' }}</ion-note>
              </ion-item>

              <!-- SRP -->
              <ion-item lines="inset" class="form-row form-row--readonly">
                <ion-label>SRP</ion-label>
                <ion-note slot="end" class="readonly-val readonly-val--gold">
                  {{ formatCurrency(form.srp) }}
                </ion-note>
              </ion-item>

              <!-- Quantity -->
              <ion-item lines="inset" class="form-row">
                <ion-label>Quantity</ion-label>
                <ion-input
                  v-model.number="form.quantity"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  slot="end"
                  class="num-input"
                />
              </ion-item>

              <!-- Discount type + value (same row) -->
              <ion-item lines="inset" class="form-row">
                <ion-label>Discount</ion-label>
                <ion-select
                  v-model="form.discountType"
                  interface="popover"
                  slot="end"
                  class="disc-type-select"
                >
                  <ion-select-option value="percent">%</ion-select-option>
                  <ion-select-option value="amount">₱ Amt</ion-select-option>
                </ion-select>
                <ion-input
                  v-model.number="form.discountValue"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  placeholder="0"
                  slot="end"
                  class="num-input"
                />
              </ion-item>

              <!-- Total amount -->
              <ion-item lines="none" class="form-row total-row">
                <ion-label><strong>Total Amount</strong></ion-label>
                <ion-note slot="end" class="total-val">
                  {{ formatCurrency(totalAmount) }}
                </ion-note>
              </ion-item>

              <!-- Action buttons -->
              <div v-if="selectedCustomer" class="action-btns">
                <ion-button expand="block" color="primary" @click="addToSales">
                  <ion-icon :icon="addCircleOutline" slot="start" />
                  Add to Sales
                </ion-button>
                <ion-button expand="block" fill="outline" color="danger" @click="addToReturn">
                  <ion-icon :icon="returnDownBackOutline" slot="start" />
                  Add to Return
                </ion-button>
              </div>

              <div v-else class="no-cust-notice">
                <ion-icon :icon="alertCircleOutline" color="warning" />
                <p>Select a customer above to add items.</p>
              </div>
            </template>
          </ion-card-content>
        </ion-card>

        <!-- ══ Order Lists ══ -->
        <template v-if="sessionStore.hasLines">
          <ion-segment v-model="activeTab" class="order-segment">
            <ion-segment-button value="sales">
              <ion-label>
                Sales
                <ion-badge v-if="sessionStore.salesOrders.length" color="primary" class="tab-bdg">
                  {{ sessionStore.salesOrders.length }}
                </ion-badge>
              </ion-label>
            </ion-segment-button>
            <ion-segment-button value="returns">
              <ion-label>
                Returns
                <ion-badge v-if="sessionStore.returnOrders.length" color="danger" class="tab-bdg">
                  {{ sessionStore.returnOrders.length }}
                </ion-badge>
              </ion-label>
            </ion-segment-button>
          </ion-segment>

          <ion-list class="order-list" lines="full">
            <ion-item-sliding
              v-for="line in activeOrders"
              :key="line.id"
            >
              <ion-item>
                <ion-label>
                  <h3>{{ line.itemName }}</h3>
                  <p>
                    {{ line.itemNumber }} &bull;
                    Qty {{ line.quantity }} &times; {{ formatCurrency(line.srp) }}
                  </p>
                  <p>
                    Disc: {{ formatDiscount(line.discountType, line.discountValue) }}
                    &bull; Total: {{ formatCurrency(line.totalAmount) }}
                  </p>
                </ion-label>
                <ion-note
                  slot="end"
                  :color="activeTab === 'sales' ? 'primary' : 'danger'"
                  class="line-total"
                >
                  {{ formatCurrency(line.totalAmount) }}
                </ion-note>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="danger" @click="deleteActiveLine(line.id)">
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>

            <!-- Subtotal row -->
            <ion-item lines="none" class="subtotal-row">
              <ion-label>
                <strong>
                  {{ activeOrders.length }}
                  {{ activeOrders.length === 1 ? 'item' : 'items' }}
                </strong>
              </ion-label>
              <ion-note slot="end" class="subtotal-val">
                {{ formatCurrency(activeTab === 'sales' ? sessionStore.salesTotal : sessionStore.returnTotal) }}
              </ion-note>
            </ion-item>
          </ion-list>

          <!-- Bottom spacer so submit bar doesn't cover last item -->
          <div style="height: 80px;" />
        </template>

        <div v-else class="empty-orders">
          <ion-icon :icon="cartOutline" color="medium" />
          <p>No items added yet.<br />Select an item and tap Add to Sales or Add to Return.</p>
        </div>
      </template>
    </ion-content>

    <!-- ── Sticky submit bar ── -->
    <div v-if="sessionStore.hasLines" class="submit-bar">
      <div class="submit-bar__left">
        <span class="submit-bar__count">
          {{ sessionStore.salesOrders.length + sessionStore.returnOrders.length }} items
        </span>
        <span class="submit-bar__amount">{{ formatCurrency(sessionStore.salesTotal + sessionStore.returnTotal) }}</span>
      </div>
      <ion-button class="submit-bar__btn" router-link="/app/submit">
        Review &amp; Submit
        <ion-icon :icon="arrowForwardOutline" slot="end" />
      </ion-button>
    </div>

    <!-- ══════════ Customer Modal ══════════ -->
    <ion-modal :is-open="showCustomerModal" @did-dismiss="showCustomerModal = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Select Customer</ion-title>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="showCustomerModal = false">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-toolbar>
            <ion-searchbar
              v-model="customerSearch"
              placeholder="Search name, code, or city…"
              :debounce="200"
              :show-clear-button="'focus'"
            />
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list v-if="filteredCustomers.length" lines="full">
            <ion-item
              v-for="c in filteredCustomers"
              :key="c.id"
              button
              :detail="false"
              @click="selectCustomer(c)"
            >
              <ion-icon :icon="storefrontOutline" slot="start" color="medium" />
              <ion-label>
                <h3>{{ c.displayName }}</h3>
                <p>{{ c.number }} &bull; {{ c.city }}</p>
              </ion-label>
              <ion-icon
                v-if="selectedCustomer?.id === c.id"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
          </ion-list>
          <div v-else class="modal-empty">
            <p>No customers found for "<strong>{{ customerSearch }}</strong>"</p>
          </div>
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- ══════════ Item Selector Modal ══════════ -->
    <item-selector-modal
      v-if="showItemModal"
      :items="cachedItems"
      :categories="categories"
      :initial-category-code="form.categoryCode"
      @select="onItemSelected"
      @close="showItemModal = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonBadge,
  IonModal,
  IonSearchbar,
  IonSpinner,
  toastController,
} from '@ionic/vue';
import {
  syncOutline,
  timeOutline,
  hourglassOutline,
  cloudDownloadOutline,
  alertCircleOutline,
  chevronDownOutline,
  barcodeOutline,
  addCircleOutline,
  returnDownBackOutline,
  trashOutline,
  cartOutline,
  storefrontOutline,
  checkmarkOutline,
  closeOutline,
  arrowForwardOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore, computeTotal } from '@/stores/session.store';
import { useSync } from '@/composables/useSync';
import { useCustomerFilter } from '@/composables/useCustomerFilter';
import { StorageService } from '@/services/storage.service';
import { formatCurrency, formatDiscount } from '@/utils/format';
import ItemSelectorModal from '@/components/ItemSelectorModal.vue';
import type { Customer, Item, ItemCategory, DiscountType } from '@/types';

/* ─── Stores / composables ─── */
const authStore = useAuthStore();
const sessionStore = useSessionStore();
const { isSyncing, syncError, lastSyncLabel, hasCache, sync } = useSync();

/* ─── Cached data ─── */
const cachedCustomers = ref<Customer[]>([]);
const cachedItems = ref<Item[]>([]);
const categories = ref<ItemCategory[]>([]);

function refreshCache() {
  cachedCustomers.value = StorageService.getCachedCustomers();
  cachedItems.value = StorageService.getCachedItems();
  categories.value = StorageService.getCachedItemCategories();
}

onMounted(() => {
  refreshCache();
  if (!sessionStore.currentSession && authStore.brand && authStore.user) {
    sessionStore.startNewSession(authStore.brand, authStore.user);
  }
});

/* ─── Sync ─── */
async function handleSync() {
  await sync();
  refreshCache();
}

/* ─── Customer modal ─── */
const showCustomerModal = ref(false);
const customerSearch = ref('');

const brandRef = computed(() => authStore.brand);
const allCustomersRef = computed(() => cachedCustomers.value);
const customerSearchRef = computed(() => customerSearch.value);
const { filteredCustomers } = useCustomerFilter(brandRef, allCustomersRef, customerSearchRef);

const selectedCustomer = computed(() => sessionStore.currentSession?.customer ?? null);

function selectCustomer(c: Customer) {
  sessionStore.setCustomer(c);
  showCustomerModal.value = false;
  customerSearch.value = '';
}

/* ─── Item form ─── */
const showItemModal = ref(false);
const activeTab = ref<'sales' | 'returns'>('sales');

interface ScanForm {
  categoryCode: string;
  itemId: string;
  itemNumber: string;
  itemName: string;
  description: string;
  srp: number;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
}

const form = reactive<ScanForm>({
  categoryCode: '',
  itemId: '',
  itemNumber: '',
  itemName: '',
  description: '',
  srp: 0,
  quantity: 1,
  discountType: 'percent',
  discountValue: 0,
});

const totalAmount = computed(() =>
  computeTotal(form.srp, form.quantity, form.discountType, form.discountValue),
);

const activeOrders = computed(() =>
  activeTab.value === 'sales' ? sessionStore.salesOrders : sessionStore.returnOrders,
);

const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
);

/* ─── Item selected from modal ─── */
function onItemSelected(item: Item) {
  form.itemId = item.id;
  form.itemNumber = item.number;
  form.itemName = item.displayName;
  form.description = item.description || item.displayName;
  form.srp = item.unitPrice;
  form.categoryCode = item.itemCategoryCode || form.categoryCode;
  form.quantity = 1;
  form.discountType = 'percent';
  form.discountValue = 0;
  showItemModal.value = false;
}

/* ─── Add lines ─── */
async function addToSales() {
  if (!form.itemId || !selectedCustomer.value) return;
  sessionStore.addSalesOrder({
    itemId: form.itemId,
    itemNumber: form.itemNumber,
    itemName: form.itemName,
    description: form.description,
    srp: form.srp,
    quantity: Math.max(1, form.quantity),
    discountType: form.discountType,
    discountValue: Math.max(0, form.discountValue),
  });
  resetItemForm();
  activeTab.value = 'sales';
  await toast(`${form.itemName || 'Item'} added to Sales`, 'success');
}

async function addToReturn() {
  if (!form.itemId || !selectedCustomer.value) return;
  sessionStore.addReturnOrder({
    itemId: form.itemId,
    itemNumber: form.itemNumber,
    itemName: form.itemName,
    description: form.description,
    srp: form.srp,
    quantity: Math.max(1, form.quantity),
    discountType: form.discountType,
    discountValue: Math.max(0, form.discountValue),
  });
  resetItemForm();
  activeTab.value = 'returns';
  await toast(`${form.itemName || 'Item'} added to Returns`, 'success');
}

function deleteActiveLine(lineId: string) {
  if (activeTab.value === 'sales') {
    sessionStore.removeSalesOrder(lineId);
  } else {
    sessionStore.removeReturnOrder(lineId);
  }
}

function resetItemForm() {
  /* Keep category; clear item-specific fields */
  form.itemId = '';
  form.itemNumber = '';
  form.itemName = '';
  form.description = '';
  form.srp = 0;
  form.quantity = 1;
  form.discountType = 'percent';
  form.discountValue = 0;
}

async function toast(message: string, color: string) {
  const t = await toastController.create({
    message,
    duration: 1800,
    color,
    position: 'bottom',
  });
  t.present();
}
</script>

<style scoped>
/* ── Header ── */
.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-logo { width: 28px; height: 28px; object-fit: contain; }

/* ── Sync sub-bar ── */
.sync-bar {
  --background: #242424;
  --border-color: #333;
  min-height: 34px;
}
.sync-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  width: 100%;
  min-height: 34px;
}
.sync-info-text {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--app-text-muted);
}
.sync-today { font-size: 11px; color: var(--app-gold-light); }

/* ── State cards ── */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  gap: 10px;
  text-align: center;
}
.state-card ion-icon { font-size: 52px; }
.state-card p { font-size: 16px; font-weight: 600; color: var(--app-dark); margin: 0; }
.state-sub { font-size: 13px; color: var(--app-text-muted); margin: 0 !important; }

/* ── Sync error banner ── */
.sync-err-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff0f0;
  font-size: 13px;
  color: var(--ion-color-danger);
}

/* ── Form card ── */
.form-card { margin: 10px 12px 0; }

.field-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--app-gold);
  margin: 0 0 8px;
}

/* ── Customer tap ── */
.customer-tap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 6px 0;
}
.cust-name { font-size: 15px; font-weight: 700; color: var(--app-dark); margin: 0; }
.cust-sub  { font-size: 12px; color: var(--app-text-muted); margin: 2px 0 0; }
.cust-placeholder { font-size: 14px; color: var(--app-text-muted); margin: 0; }

/* ── Item form body ── */
.item-form-body { padding-bottom: 8px; }

.form-row {
  --background: transparent;
  --padding-start: 0;
  --inner-padding-end: 0;
  --min-height: 48px;
}

.form-row--readonly {
  --background: var(--app-surface-alt);
  border-radius: 6px;
  margin: 2px 0;
}

.form-select { max-width: 200px; font-size: 14px; }

.item-trigger-end {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 200px;
}
.item-trigger-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
.item-trigger-placeholder { font-size: 13px; color: var(--app-text-muted); }

.readonly-val {
  font-size: 13px;
  color: var(--app-dark);
  text-align: right;
  max-width: 55%;
  white-space: normal;
  word-break: break-word;
}
.readonly-val--gold { color: var(--app-gold); font-weight: 700; }

.num-input {
  max-width: 80px;
  text-align: right;
  --padding-end: 0;
}

.disc-type-select { max-width: 90px; font-size: 13px; }

/* ── Total row ── */
.total-row {
  --background: var(--app-gold-pale);
  border-radius: 8px;
  margin-top: 6px;
}
.total-val {
  font-size: 20px;
  font-weight: 800;
  color: var(--app-gold);
}

/* ── Action buttons ── */
.action-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

/* ── No customer notice ── */
.no-cust-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 4px;
  font-size: 13px;
  color: var(--app-text-muted);
}
.no-cust-notice ion-icon { font-size: 18px; flex-shrink: 0; }
.no-cust-notice p { margin: 0; }

/* ── Order tabs / list ── */
.order-segment {
  margin: 12px 12px 0;
}

.order-list {
  background: var(--app-surface);
  margin: 0;
}

.tab-bdg {
  vertical-align: middle;
  margin-left: 4px;
  font-size: 11px;
  height: 18px;
  min-width: 18px;
  padding: 0 5px;
}

.line-total { font-size: 14px; font-weight: 700; }

.subtotal-row {
  --background: var(--app-surface-alt);
  border-top: 1px solid var(--app-border);
  --min-height: 44px;
}
.subtotal-val { font-size: 16px; font-weight: 800; color: var(--app-dark); }

/* ── Empty orders ── */
.empty-orders {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 24px;
  gap: 10px;
  text-align: center;
}
.empty-orders ion-icon { font-size: 48px; }
.empty-orders p { font-size: 14px; color: var(--app-text-muted); line-height: 1.6; margin: 0; }

/* ── Submit bar ── */
.submit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  background: var(--app-dark);
  border-top: 1px solid #2a2a2a;
  position: sticky;
  bottom: 0;
  z-index: 10;
}
.submit-bar__left { display: flex; flex-direction: column; gap: 1px; }
.submit-bar__count { font-size: 11px; color: var(--app-text-muted); }
.submit-bar__amount { font-size: 18px; font-weight: 800; color: var(--app-gold-light); }
.submit-bar__btn {
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  height: 42px;
  font-weight: 700;
}

/* ── Customer modal internals ── */
.modal-empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
}
</style>
