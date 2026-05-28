<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/scan" />
        </ion-buttons>
        <ion-title>Review &amp; Submit</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="session">

      <!-- Offline notice -->
      <Transition name="net-notice-fade">
        <div v-if="!isOnline" class="offline-notice">
          <ion-icon :icon="cloudOfflineOutline" />
          <div>
            <span class="offline-notice-main">Offline Mode</span>
            <span class="offline-notice-sub">Reconnect to submit orders. Your session is saved.</span>
          </div>
        </div>
      </Transition>

      <!-- Customer info -->
      <ion-card class="info-card">
        <ion-card-content>
          <div class="customer-info">
            <ion-icon :icon="storefrontOutline" color="primary" />
            <div>
              <p class="cust-name">{{ session.customer?.displayName ?? 'No customer selected' }}</p>
              <p class="cust-sub">
                {{ session.customer?.number }} &bull;
                {{ session.brand.displayName }} &bull;
                {{ formatDate(session.createdAt) }}
              </p>
              <p v-if="session.orderDate" class="cust-order-date">
                <ion-icon :icon="calendarOutline" />
                Order Date: <strong>{{ session.orderDate }}</strong>
              </p>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- ── Sales Orders Section ── -->
      <div v-if="sessionStore.salesOrders.length" class="section">
        <div class="section-header">
          <p class="section-title">
            <ion-icon :icon="cartOutline" /> Sales Orders
            <ion-badge color="primary">{{ sessionStore.salesOrders.length }}</ion-badge>
          </p>
          <p class="section-sub">{{ sessionStore.salesQty }} units &bull; {{ formatCurrency(sessionStore.salesTotal) }}</p>
        </div>

        <ion-list lines="full" class="order-table">
          <ion-item v-for="line in sessionStore.salesOrders" :key="line.id">
            <ion-label>
              <h3>{{ line.itemName }}</h3>
              <p>{{ line.itemNumber }} &bull; Qty {{ line.quantity }} × {{ formatCurrency(line.srp) }}</p>
              <p>Discount: {{ formatDiscount(line.discountType, line.discountValue) }}</p>
            </ion-label>
            <ion-note slot="end" color="primary" class="line-total">
              {{ formatCurrency(line.totalAmount) }}
            </ion-note>
          </ion-item>
          <ion-item lines="none" class="subtotal-item">
            <ion-label><strong>Subtotal</strong></ion-label>
            <ion-note slot="end" class="subtotal-amount">
              {{ formatCurrency(sessionStore.salesTotal) }}
            </ion-note>
          </ion-item>
        </ion-list>

        <!-- Submit sales button / status -->
        <div class="submit-action" v-if="salesStatus === 'pending' || salesStatus === 'submitting'">
          <ion-button
            expand="block"
            color="primary"
            :disabled="salesStatus === 'submitting' || !session.customer || !isOnline"
            @click="confirmSubmit('sales')"
          >
            <ion-spinner v-if="salesStatus === 'submitting'" name="crescent" slot="start" />
            <ion-icon v-else :icon="sendOutline" slot="start" />
            {{ salesStatus === 'submitting' ? 'Submitting…' : 'Submit Sales Orders' }}
          </ion-button>
        </div>

        <Transition name="status-in">
        <div v-if="salesStatus === 'done'" class="status-badge status-badge--done">
          <ion-icon :icon="checkmarkCircleOutline" />
          <span>Sales submitted{{ salesSeriesNo ? ` — Series: ${salesSeriesNo}` : '' }}</span>
        </div>
        </Transition>

        <Transition name="status-in">
        <div v-if="salesStatus === 'failed'" class="status-badge status-badge--failed">
          <ion-icon :icon="alertCircleOutline" />
          <div>
            <p>Sales submission failed.</p>
            <p class="error-detail">{{ salesError }}</p>
            <ion-button size="small" fill="outline" color="danger" @click="confirmSubmit('sales')">
              Retry
            </ion-button>
          </div>
        </div>
        </Transition>
      </div>

      <!-- ── Return Orders Section ── -->
      <div v-if="sessionStore.returnOrders.length" class="section">
        <div class="section-header">
          <p class="section-title">
            <ion-icon :icon="returnDownBackOutline" color="danger" /> Return Orders
            <ion-badge color="danger">{{ sessionStore.returnOrders.length }}</ion-badge>
          </p>
          <p class="section-sub">{{ sessionStore.returnQty }} units &bull; {{ formatCurrency(sessionStore.returnTotal) }}</p>
        </div>

        <ion-list lines="full" class="order-table">
          <ion-item v-for="line in sessionStore.returnOrders" :key="line.id">
            <ion-label>
              <h3>{{ line.itemName }}</h3>
              <p>{{ line.itemNumber }} &bull; Qty {{ line.quantity }} × {{ formatCurrency(line.srp) }}</p>
              <p>Discount: {{ formatDiscount(line.discountType, line.discountValue) }}</p>
            </ion-label>
            <ion-note slot="end" color="danger" class="line-total">
              {{ formatCurrency(line.totalAmount) }}
            </ion-note>
          </ion-item>
          <ion-item lines="none" class="subtotal-item">
            <ion-label><strong>Subtotal</strong></ion-label>
            <ion-note slot="end" class="subtotal-amount">
              {{ formatCurrency(sessionStore.returnTotal) }}
            </ion-note>
          </ion-item>
        </ion-list>

        <div class="submit-action" v-if="returnsStatus === 'pending' || returnsStatus === 'submitting'">
          <ion-button
            expand="block"
            color="danger"
            :disabled="returnsStatus === 'submitting' || !session.customer || !isOnline"
            @click="confirmSubmit('returns')"
          >
            <ion-spinner v-if="returnsStatus === 'submitting'" name="crescent" slot="start" />
            <ion-icon v-else :icon="returnDownBackOutline" slot="start" />
            {{ returnsStatus === 'submitting' ? 'Submitting…' : 'Submit Return Orders' }}
          </ion-button>
        </div>

        <Transition name="status-in">
        <div v-if="returnsStatus === 'done'" class="status-badge status-badge--done">
          <ion-icon :icon="checkmarkCircleOutline" />
          <span>Returns submitted{{ returnsSeriesNo ? ` — Series: ${returnsSeriesNo}` : '' }}</span>
        </div>
        </Transition>

        <Transition name="status-in">
        <div v-if="returnsStatus === 'failed'" class="status-badge status-badge--failed">
          <ion-icon :icon="alertCircleOutline" />
          <div>
            <p>Return submission failed.</p>
            <p class="error-detail">{{ returnsError }}</p>
            <ion-button size="small" fill="outline" color="danger" @click="confirmSubmit('returns')">
              Retry
            </ion-button>
          </div>
        </div>
        </Transition>
      </div>

      <!-- No customer warning -->
      <div v-if="!session.customer" class="no-customer-warn">
        <ion-icon :icon="alertCircleOutline" color="warning" />
        <p>No customer selected. Go back to Scan to select a customer before submitting.</p>
      </div>

      <!-- ── Finalize button ── -->
      <div class="finalize-wrap">
        <ion-button
          expand="block"
          :color="anyFailed ? 'warning' : 'dark'"
          class="finalize-btn"
          @click="finalizeSession"
        >
          <ion-icon :icon="checkmarkDoneOutline" slot="start" />
          {{ finalizeLabel }}
        </ion-button>
        <p class="finalize-hint">{{ finalizeHint }}</p>
      </div>
    </ion-content>

    <!-- No session fallback -->
    <ion-content v-else class="ion-padding">
      <div class="empty-session">
        <ion-icon :icon="alertCircleOutline" color="medium" />
        <p>No active session. Go back to start a new scan.</p>
        <ion-button router-link="/app/scan">Go to Scan</ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonBadge,
  IonSpinner,
  alertController,
  toastController,
} from '@ionic/vue';
import {
  storefrontOutline,
  cartOutline,
  returnDownBackOutline,
  sendOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  checkmarkDoneOutline,
  cloudOfflineOutline,
  calendarOutline,
} from 'ionicons/icons';
import { useSessionStore } from '@/stores/session.store';
import { ApiService } from '@/services/api.service';
import { formatCurrency, formatDate, formatDiscount } from '@/utils/format';
import type { SalesOrderPayload, SalesReturnOrderPayload } from '@/types';

const router = useRouter();
const sessionStore = useSessionStore();
const session = computed(() => sessionStore.currentSession);
const { isOnline } = useNetworkStatus();

type SubmitStatus = 'pending' | 'submitting' | 'done' | 'failed';

const salesStatus = ref<SubmitStatus>('pending');
const returnsStatus = ref<SubmitStatus>('pending');
const salesSeriesNo = ref('');
const returnsSeriesNo = ref('');
const salesError = ref('');
const returnsError = ref('');

const anyDone = computed(() => salesStatus.value === 'done' || returnsStatus.value === 'done');
const anyFailed = computed(
  () => salesStatus.value === 'failed' || returnsStatus.value === 'failed',
);

const finalizeLabel = computed(() => {
  if (!anyDone.value && !anyFailed.value) return 'Save as Draft & Go Back';
  if (anyFailed.value) return 'Save & View in History';
  return 'Finish Session';
});

const finalizeHint = computed(() => {
  if (!anyDone.value && !anyFailed.value) return 'No orders submitted yet.';
  if (anyFailed.value) return 'Failed orders are saved locally for retry.';
  return 'Session will be moved to History.';
});

async function confirmSubmit(type: 'sales' | 'returns') {
  const s = session.value;
  if (!s?.customer) return;

  const lines = type === 'sales' ? sessionStore.salesOrders : sessionStore.returnOrders;
  const label = type === 'sales' ? 'Sales Orders' : 'Return Orders';

  const alert = await alertController.create({
    header: `Submit ${label}`,
    message: `Submit ${lines.length} line(s) for ${s.customer.displayName}?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Submit', role: 'confirm' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== 'confirm') return;

  if (type === 'sales') {
    await doSubmitSales(s.customer.number);
  } else {
    await doSubmitReturns(s.customer.number);
  }
}

async function doSubmitSales(customerNumber: string) {
  salesStatus.value = 'submitting';
  const payload: SalesOrderPayload = {
    customerNumber,
    ...(session.value?.orderDate ? { orderDate: session.value.orderDate } : {}),
    lines: sessionStore.salesOrders.map((l) => ({
      itemNumber: l.itemNumber,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.srp,
      ...(l.discountType === 'percent'
        ? { discountPercent: l.discountValue }
        : { lineDiscountAmount: l.discountValue }),
    })),
  };
  try {
    const res = await ApiService.submitSalesOrder(payload);
    salesSeriesNo.value = (res as Record<string, string>)?.no ?? (res as Record<string, string>)?.series ?? '';
    salesStatus.value = 'done';
    showToast('Sales orders submitted!', 'success');
  } catch (err) {
    salesError.value = err instanceof Error ? err.message : 'Unknown error';
    salesStatus.value = 'failed';
    showToast('Sales submission failed. Will save locally.', 'danger');
  }
}

async function doSubmitReturns(customerNumber: string) {
  returnsStatus.value = 'submitting';
  const payload: SalesReturnOrderPayload = {
    customerNumber,
    ...(session.value?.orderDate ? { orderDate: session.value.orderDate } : {}),
    lines: sessionStore.returnOrders.map((l) => ({
      itemNumber: l.itemNumber,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.srp,
      ...(l.discountType === 'percent'
        ? { discountPercent: l.discountValue }
        : { lineDiscountAmount: l.discountValue }),
    })),
  };
  try {
    const res = await ApiService.submitSalesReturnOrder(payload);
    returnsSeriesNo.value = (res as Record<string, string>)?.no ?? (res as Record<string, string>)?.series ?? '';
    returnsStatus.value = 'done';
    showToast('Return orders submitted!', 'success');
  } catch (err) {
    returnsError.value = err instanceof Error ? err.message : 'Unknown error';
    returnsStatus.value = 'failed';
    showToast('Return submission failed. Will save locally.', 'danger');
  }
}

function finalizeSession() {
  // Nothing submitted yet — keep as draft and return home
  if (!anyDone.value && !anyFailed.value) {
    sessionStore.saveAsDraftAndExit();
    router.replace('/app/home');
    return;
  }
  const combinedError = [salesError.value, returnsError.value].filter(Boolean).join('; ');
  if (anyFailed.value) {
    sessionStore.markFailed(combinedError || 'Partial submission failure');
  } else {
    sessionStore.markSubmitted(salesSeriesNo.value || undefined, returnsSeriesNo.value || undefined);
  }
  router.replace('/app/history');
}

async function showToast(message: string, color: string) {
  const t = await toastController.create({ message, duration: 2500, color, position: 'bottom' });
  t.present();
}
</script>

<style scoped>
.info-card { margin: 12px 12px 4px; }

.customer-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.customer-info ion-icon { font-size: 28px; flex-shrink: 0; }

.cust-name {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--app-dark);
}
.cust-sub {
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 3px 0 0;
}
.cust-order-date {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 4px 0 0;
}
.cust-order-date ion-icon { font-size: 13px; }

/* ── Section ── */
.section {
  margin: 12px 12px 0;
  background: var(--app-surface);
  border-radius: var(--app-radius);
  border: 1px solid var(--app-border);
  overflow: hidden;
}

.section-header {
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-alt);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--app-dark);
  margin: 0 0 2px;
}
.section-title ion-icon { font-size: 16px; }

.section-sub {
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 0;
}

.order-table { margin: 0; }

.line-total {
  font-size: 14px;
  font-weight: 700;
}

.subtotal-item {
  --background: var(--app-surface-alt);
  border-top: 1px solid var(--app-border);
}

.subtotal-amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-dark);
}

/* ── Submit action ── */
.submit-action { padding: 12px; }

/* ── Status badges ── */
.status-badge {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
}

.status-badge ion-icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }

.status-badge--done {
  background: #f0fff4;
  color: var(--ion-color-success);
  font-size: 14px;
  font-weight: 600;
}
.status-badge--done ion-icon { color: var(--ion-color-success); }

.status-badge--failed {
  background: #fff0f0;
  color: var(--ion-color-danger);
  font-size: 14px;
}
.status-badge--failed ion-icon { color: var(--ion-color-danger); }

.error-detail {
  font-size: 12px;
  opacity: 0.8;
  margin: 2px 0 8px;
  line-height: 1.4;
}

.status-badge p { margin: 0; }

/* ── No customer ── */
.no-customer-warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 16px;
  margin: 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: #555;
}
.no-customer-warn ion-icon { font-size: 20px; flex-shrink: 0; }
.no-customer-warn p { margin: 0; line-height: 1.5; }

/* ── Finalize ── */
.finalize-wrap {
  padding: 20px 12px 32px;
}
.finalize-btn { height: 50px; font-size: 16px; font-weight: 700; }
.finalize-hint {
  text-align: center;
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 8px 0 0;
}

/* ── Entrance stagger ── */
.info-card { animation: fade-slide-up 0.35s var(--ease-out-quart) both; }
.section:nth-of-type(1) { animation: fade-slide-up 0.35s var(--ease-out-quart) 0.06s both; }
.section:nth-of-type(2) { animation: fade-slide-up 0.35s var(--ease-out-quart) 0.11s both; }
.finalize-wrap { animation: fade-slide-up 0.35s var(--ease-out-quart) 0.16s both; }

/* ── Status badge Transition ── */
.status-in-enter-active {
  transition: opacity 0.26s ease, transform 0.26s var(--ease-out-quart);
}
.status-in-leave-active { transition: opacity 0.16s ease; }
.status-in-enter-from   { opacity: 0; transform: scale(0.92) translateY(-4px); }
.status-in-leave-to     { opacity: 0; }

/* ── Finalize button press ── */
.finalize-btn { transition: transform 0.12s var(--ease-out-expo); }
.finalize-btn:active { transform: scale(0.98); }

/* ── Empty session ── */
.empty-session {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 60px;
  text-align: center;
  color: var(--app-text-muted);
}
.empty-session ion-icon { font-size: 48px; }

/* ── Offline notice ── */
.offline-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 12px 12px 0;
  border-radius: 10px;
  background: rgba(var(--ion-color-warning-rgb), 0.12);
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.3);
  color: var(--ion-color-warning-shade);
}
.offline-notice ion-icon { font-size: 1.4rem; flex-shrink: 0; }
.offline-notice > div { display: flex; flex-direction: column; gap: 2px; }
.offline-notice-main { font-size: 13px; font-weight: 700; }
.offline-notice-sub  { font-size: 11px; opacity: 0.85; }
.net-notice-fade-enter-active,
.net-notice-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.net-notice-fade-enter-from,
.net-notice-fade-leave-to    { opacity: 0; transform: translateY(-6px); }
</style>
