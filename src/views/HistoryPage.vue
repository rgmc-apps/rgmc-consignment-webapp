<template>
  <ion-page :class="{ 'history--minimalist': isMinimalist }">
    <!-- ── Header ── -->
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <div class="header-title">
            <img :src="headerLogoSrc" alt="logo" class="header-logo" />
            <span>History</span>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="filteredSessions.length"
            fill="clear"
            @click="downloadHistory"
          >
            <ion-icon :icon="downloadOutline" slot="icon-only" />
          </ion-button>
          <bug-report-button />
        </ion-buttons>
      </ion-toolbar>

      <!-- Filter chips -->
      <ion-toolbar v-if="sessionStore.completedSessions.length" class="filter-toolbar">
        <div class="filter-chips">
          <ion-chip
            :color="activeFilter === 'all' ? 'primary' : 'medium'"
            @click="activeFilter = 'all'"
            class="filter-chip"
          >All ({{ sessionStore.completedSessions.length }})</ion-chip>
          <ion-chip
            :color="activeFilter === 'submitted' ? 'success' : 'medium'"
            @click="activeFilter = 'submitted'"
            class="filter-chip"
          >
            <ion-icon :icon="checkmarkCircleOutline" />
            Submitted ({{ submittedCount }})
          </ion-chip>
          <ion-chip
            :color="activeFilter === 'failed' ? 'danger' : 'medium'"
            @click="activeFilter = 'failed'"
            class="filter-chip"
          >
            <ion-icon :icon="alertCircleOutline" />
            Failed ({{ failedCount }})
          </ion-chip>
        </div>
      </ion-toolbar>
    </ion-header>

    <!-- ── Content ── -->
    <ion-content>

      <ion-refresher slot="fixed" @ionRefresh="onPullRefresh($event)">
        <ion-refresher-content
          :pulling-icon="chevronDownCircleOutline"
          pulling-text="Pull to refresh"
          refreshing-spinner="crescent"
          refreshing-text="Refreshing…"
        />
      </ion-refresher>

      <!-- Empty state -->
      <div v-if="!sessionStore.completedSessions.length" class="empty-history">
        <ion-icon :icon="timeOutline" color="medium" />
        <p>No submitted sessions yet.<br />Completed sessions will appear here.</p>
      </div>

      <!-- Filtered empty state -->
      <div v-else-if="!filteredSessions.length" class="empty-history">
        <ion-icon :icon="filterOutline" color="medium" />
        <p>No {{ activeFilter }} sessions.</p>
      </div>

      <!-- Session list — :key forces remount on filter change to replay stagger -->
      <ion-list v-else lines="full" :key="activeFilter">
        <ion-item
          v-for="session in filteredSessions"
          :key="session.id"
          button
          :detail="false"
          @click="openDetail(session)"
        >
          <ion-icon
            :icon="session.status === 'submitted' ? checkmarkCircleOutline : alertCircleOutline"
            :color="session.status === 'submitted' ? 'success' : 'danger'"
            slot="start"
          />
          <ion-label>
            <h3 class="session-customer">{{ session.customer?.displayName ?? '— No customer —' }}</h3>
            <p class="session-meta">
              {{ session.brand.displayName }} &bull; {{ formatDate(session.createdAt) }}
            </p>
            <p class="session-counts">
              <span v-if="session.salesOrders.length">
                Sales: {{ session.salesOrders.length }} lines
                ({{ formatCurrency(sessionSalesTotal(session)) }})
              </span>
              <span v-if="session.salesOrders.length && session.returnOrders.length"> &bull; </span>
              <span v-if="session.returnOrders.length">
                Returns: {{ session.returnOrders.length }} lines
                ({{ formatCurrency(sessionReturnTotal(session)) }})
              </span>
            </p>
            <p v-if="session.salesOrderSeries || session.returnOrderSeries" class="session-series">
              <span v-if="session.salesOrderSeries">SO# {{ session.salesOrderSeries }}</span>
              <span v-if="session.salesOrderSeries && session.returnOrderSeries"> &bull; </span>
              <span v-if="session.returnOrderSeries">SRO# {{ session.returnOrderSeries }}</span>
            </p>
            <p v-if="session.status === 'failed' && session.errorMessage" class="session-error">
              {{ session.errorMessage }}
            </p>
          </ion-label>
          <div slot="end" class="item-end">
            <ion-badge :color="session.status === 'submitted' ? 'success' : 'danger'" class="status-badge">
              {{ session.status === 'submitted' ? 'Submitted' : 'Failed' }}
            </ion-badge>
            <ion-note class="item-total">{{ formatCurrency(sessionTotal(session)) }}</ion-note>
          </div>
        </ion-item>
      </ion-list>
    </ion-content>

    <!-- ══════════════ SESSION DETAIL MODAL ══════════════ -->
    <ion-modal
      :is-open="!!selectedSession"
      @did-dismiss="selectedSession = null"
    >
      <ion-page v-if="selectedSession">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button fill="clear" @click="selectedSession = null">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
            <ion-title>Session Detail</ion-title>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="downloadSingle(selectedSession)">
                <ion-icon :icon="downloadOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content class="detail-content">
          <!-- Customer / session info card -->
          <ion-card class="info-card">
            <ion-card-content>
              <div class="info-grid">
                <div class="info-row">
                  <span class="info-label">Customer</span>
                  <span class="info-value">{{ selectedSession.customer?.displayName ?? '—' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Brand</span>
                  <span class="info-value">{{ selectedSession.brand.displayName }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">User</span>
                  <span class="info-value">{{ selectedSession.user.displayName }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Posting Date</span>
                  <span class="info-value">{{ selectedSession.postingDate ? formatDate(selectedSession.postingDate) : '—' }}</span>
                </div>
                <div v-if="selectedSession.submittedAt" class="info-row">
                  <span class="info-label">Date Submitted</span>
                  <span class="info-value">{{ formatDateTime(selectedSession.submittedAt) }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status</span>
                  <ion-badge
                    :color="selectedSession.status === 'submitted' ? 'success' : 'danger'"
                    class="info-badge"
                  >
                    {{ selectedSession.status === 'submitted' ? 'Submitted' : 'Failed' }}
                  </ion-badge>
                </div>
                <div v-if="selectedSession.salesOrderSeries" class="info-row">
                  <span class="info-label">SO#</span>
                  <span class="info-value series-num">{{ selectedSession.salesOrderSeries }}</span>
                </div>
                <div v-if="selectedSession.returnOrderSeries" class="info-row">
                  <span class="info-label">SRO#</span>
                  <span class="info-value series-num">{{ selectedSession.returnOrderSeries }}</span>
                </div>
              </div>

              <!-- Error message for failed sessions -->
              <div v-if="selectedSession.status === 'failed'" class="error-block">
                <ion-icon :icon="alertCircleOutline" color="danger" />
                <div class="error-block-body">
                  <p v-if="selectedSession.errorMessage">{{ selectedSession.errorMessage }}</p>
                  <p v-else class="error-block-fallback">Submission failed — no details available.</p>
                  <ion-button
                    size="small"
                    fill="outline"
                    color="danger"
                    class="report-btn"
                    @click="reportSessionError(selectedSession)"
                  >
                    <ion-icon :icon="bugOutline" slot="start" />
                    Report to IT/MIS
                  </ion-button>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <!-- Sales Orders -->
          <div v-if="selectedSession.salesOrders.length" class="section-block">
            <div class="section-header">
              <ion-icon :icon="cartOutline" color="primary" />
              <h2>Sales Orders</h2>
              <ion-badge color="primary" class="count-badge">{{ selectedSession.salesOrders.length }}</ion-badge>
            </div>
            <ion-list lines="full" class="line-list">
              <ion-item v-for="line in selectedSession.salesOrders" :key="line.id" class="line-item">
                <ion-label>
                  <h3 class="line-name">{{ line.itemName }}</h3>
                  <p class="line-meta">{{ line.itemNumber }}</p>
                  <p v-if="line.description && line.description !== line.itemName" class="line-desc">
                    {{ line.description }}
                  </p>
                  <p class="line-price-row">
                    SRP {{ formatCurrency(line.srp) }}
                    &times; {{ line.quantity }}
                    <span v-if="line.discountValue > 0">
                      &minus; {{ formatDiscount(line.discountType, line.discountValue) }}
                    </span>
                  </p>
                </ion-label>
                <ion-note slot="end" class="line-total">
                  {{ formatCurrency(line.totalAmount) }}
                </ion-note>
              </ion-item>
            </ion-list>
            <div class="subtotal-row">
              <span class="subtotal-label">Sales Subtotal</span>
              <span class="subtotal-value">{{ formatCurrency(sessionSalesTotal(selectedSession)) }}</span>
            </div>
          </div>

          <!-- Return Orders -->
          <div v-if="selectedSession.returnOrders.length" class="section-block">
            <div class="section-header">
              <ion-icon :icon="returnUpBackOutline" color="warning" />
              <h2>Return Orders</h2>
              <ion-badge color="warning" class="count-badge">{{ selectedSession.returnOrders.length }}</ion-badge>
            </div>
            <ion-list lines="full" class="line-list">
              <ion-item v-for="line in selectedSession.returnOrders" :key="line.id" class="line-item">
                <ion-label>
                  <h3 class="line-name">{{ line.itemName }}</h3>
                  <p class="line-meta">{{ line.itemNumber }}</p>
                  <p v-if="line.description && line.description !== line.itemName" class="line-desc">
                    {{ line.description }}
                  </p>
                  <p class="line-price-row">
                    SRP {{ formatCurrency(line.srp) }}
                    &times; {{ line.quantity }}
                    <span v-if="line.discountValue > 0">
                      &minus; {{ formatDiscount(line.discountType, line.discountValue) }}
                    </span>
                  </p>
                </ion-label>
                <ion-note slot="end" class="line-total">
                  {{ formatCurrency(line.totalAmount) }}
                </ion-note>
              </ion-item>
            </ion-list>
            <div class="subtotal-row">
              <span class="subtotal-label">Returns Subtotal</span>
              <span class="subtotal-value">{{ formatCurrency(sessionReturnTotal(selectedSession)) }}</span>
            </div>
          </div>

          <!-- Grand total -->
          <div class="grand-total-row">
            <span class="grand-total-label">Grand Total</span>
            <span class="grand-total-value">{{ formatCurrency(sessionTotal(selectedSession)) }}</span>
          </div>

          <!-- Retry button for failed sessions -->
          <div v-if="selectedSession.status === 'failed'" class="retry-wrap ion-padding">
            <ion-button
              expand="block"
              color="warning"
              @click="handleRetry(selectedSession)"
            >
              <ion-icon :icon="refreshOutline" slot="start" />
              Retry Submission
            </ion-button>
            <p class="retry-hint">This will restore the session so you can resubmit from the Submit screen.</p>
          </div>
        </ion-content>
      </ion-page>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonNote,
  IonChip,
  IonCard,
  IonCardContent,
  IonModal,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue';
import {
  timeOutline,
  downloadOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  filterOutline,
  closeOutline,
  cartOutline,
  returnUpBackOutline,
  refreshOutline,
  chevronDownCircleOutline,
  bugOutline,
} from 'ionicons/icons';
import { useSessionStore } from '@/stores/session.store';
import { useTheme } from '@/composables/useTheme';
import { formatCurrency, formatDate, formatDateTime, formatDiscount } from '@/utils/format';
import { useErrorReporter } from '@/composables/useErrorReporter';
import BugReportButton from '@/components/BugReportButton.vue';
import type { ScanSession } from '@/types';

const router = useRouter();
const sessionStore = useSessionStore();
const { theme } = useTheme();
const { openReport } = useErrorReporter();

function reportSessionError(session: ScanSession) {
  openReport({
    error: session.errorMessage ? new Error(session.errorMessage) : undefined,
    context: `Session: ${session.customer?.displayName ?? 'Unknown'} | ${session.brand.displayName} | ${formatDate(session.createdAt)}`,
  });
}
const isMinimalist = computed(() => theme.value === 'minimalist');
const headerLogoSrc = computed(() =>
  isMinimalist.value ? '/static/logo-bnw.png' : '/static/cons-logo.png',
);

function onPullRefresh(ev: CustomEvent) {
  sessionStore.loadFromStorage();
  (ev.target as HTMLIonRefresherElement).complete();
}

/* ─── Filter state ─── */
type FilterType = 'all' | 'submitted' | 'failed';
const activeFilter = ref<FilterType>('all');

const submittedCount = computed(() =>
  sessionStore.completedSessions.filter((s) => s.status === 'submitted').length,
);
const failedCount = computed(() =>
  sessionStore.completedSessions.filter((s) => s.status === 'failed').length,
);

const filteredSessions = computed(() => {
  if (activeFilter.value === 'all') return sessionStore.completedSessions;
  return sessionStore.completedSessions.filter((s) => s.status === activeFilter.value);
});

/* ─── Session helpers ─── */
function sessionSalesTotal(session: ScanSession): number {
  return session.salesOrders.reduce((s, l) => s + l.totalAmount, 0);
}
function sessionReturnTotal(session: ScanSession): number {
  return session.returnOrders.reduce((s, l) => s + l.totalAmount, 0);
}
function sessionTotal(session: ScanSession): number {
  return sessionSalesTotal(session) + sessionReturnTotal(session);
}

/* ─── Detail modal ─── */
const selectedSession = ref<ScanSession | null>(null);

function openDetail(session: ScanSession) {
  selectedSession.value = session;
}

/* ─── Retry ─── */
async function handleRetry(session: ScanSession) {
  selectedSession.value = null;
  await new Promise((r) => setTimeout(r, 300)); // let modal dismiss
  sessionStore.retryFailedSession(session);
  router.push('/app/submit');
}

/* ─── Download single session ─── */
function downloadSingle(session: ScanSession) {
  const lines = buildSessionLines(session);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (session.customer?.displayName ?? 'session').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `rgmc-${safeName}-${session.createdAt.slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Download all history ─── */
function downloadHistory() {
  const sessions = filteredSessions.value;
  if (!sessions.length) return;

  const lines: string[] = [
    'RGMC CONSIGNMENT — SESSION HISTORY',
    `Exported : ${new Date().toLocaleString('en-PH')}`,
    `Filter   : ${activeFilter.value.toUpperCase()}`,
    '='.repeat(64),
    '',
  ];

  sessions.forEach((s, idx) => {
    lines.push(`[${idx + 1}] ${s.customer?.displayName ?? 'No customer'}`);
    lines.push(...buildSessionLines(s).slice(0, -1)); // skip trailing blank
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rgmc-history-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildSessionLines(s: ScanSession): string[] {
  const lines: string[] = [];
  const sep = '-'.repeat(64);

  lines.push(`Customer : ${s.customer?.displayName ?? '—'}`);
  lines.push(`Brand    : ${s.brand.displayName}`);
  lines.push(`User     : ${s.user.displayName}`);
  lines.push(`Posting Date : ${s.postingDate ? formatDate(s.postingDate) : '—'}`);
  lines.push(`Status   : ${s.status.toUpperCase()}`);
  if (s.salesOrderSeries) lines.push(`SO#      : ${s.salesOrderSeries}`);
  if (s.returnOrderSeries) lines.push(`SRO#     : ${s.returnOrderSeries}`);
  if (s.status === 'failed' && s.errorMessage) lines.push(`Error    : ${s.errorMessage}`);
  lines.push(sep);

  if (s.salesOrders.length) {
    lines.push('SALES ORDERS');
    s.salesOrders.forEach((l, i) => {
      lines.push(`  ${i + 1}. ${l.itemName}`);
      lines.push(`     Code : ${l.itemNumber}`);
      lines.push(`     SRP  : ${formatCurrency(l.srp)}  Qty: ${l.quantity}  Disc: ${formatDiscount(l.discountType, l.discountValue)}`);
      lines.push(`     Total: ${formatCurrency(l.totalAmount)}`);
    });
    lines.push(`  Subtotal: ${formatCurrency(sessionSalesTotal(s))}`);
    lines.push('');
  }

  if (s.returnOrders.length) {
    lines.push('RETURN ORDERS');
    s.returnOrders.forEach((l, i) => {
      lines.push(`  ${i + 1}. ${l.itemName}`);
      lines.push(`     Code : ${l.itemNumber}`);
      lines.push(`     SRP  : ${formatCurrency(l.srp)}  Qty: ${l.quantity}  Disc: ${formatDiscount(l.discountType, l.discountValue)}`);
      lines.push(`     Total: ${formatCurrency(l.totalAmount)}`);
    });
    lines.push(`  Subtotal: ${formatCurrency(sessionReturnTotal(s))}`);
    lines.push('');
  }

  lines.push(`GRAND TOTAL: ${formatCurrency(sessionTotal(s))}`);
  lines.push('');

  return lines;
}
</script>

<style scoped>
/* ── Header ── */
.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

/* ── Filter chips ── */
.filter-toolbar {
  --background: var(--app-surface);
  --border-color: var(--app-border);
}
.filter-chips {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}
.filter-chips::-webkit-scrollbar { display: none; }
.filter-chip {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  height: 28px;
  margin: 0;
}
.filter-chip ion-icon { font-size: 14px; margin-right: 4px; }

/* ── Filter chip active transition ── */
.filter-chip { transition: color 0.18s ease, background 0.18s ease, opacity 0.18s ease; }

/* ── Empty states ── */
.empty-history {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  gap: 12px;
  animation: fade-in 0.3s ease both;
}
.empty-history ion-icon { font-size: 56px; }
.empty-history p {
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

/* ── Session list rows ── */
.session-customer {
  font-weight: 700;
  font-size: var(--text-base);
  letter-spacing: var(--tracking-tight);
}
.session-meta {
  font-size: var(--text-xs);
  color: var(--app-text-muted);
}
.session-counts {
  font-size: var(--text-xs);
  color: var(--ion-color-medium);
}
.session-series {
  font-size: var(--text-xs);
  color: var(--app-gold);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
}
.session-error {
  font-size: var(--text-xs);
  color: var(--ion-color-danger);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.item-end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.status-badge { font-size: var(--text-2xs); font-weight: 700; letter-spacing: var(--tracking-wide); }
.item-total {
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--app-fg);
  letter-spacing: var(--tracking-tighter);
  font-variant-numeric: tabular-nums;
}

/* ── Session list stagger ── */
ion-list ion-item:nth-child(1) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.02s both; }
ion-list ion-item:nth-child(2) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.05s both; }
ion-list ion-item:nth-child(3) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.08s both; }
ion-list ion-item:nth-child(4) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.11s both; }
ion-list ion-item:nth-child(5) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.14s both; }
ion-list ion-item:nth-child(6) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.17s both; }
ion-list ion-item:nth-child(7) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.20s both; }
ion-list ion-item:nth-child(8) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.23s both; }

/* ══════════ DETAIL MODAL ══════════ */
.detail-content {
  --background: var(--app-surface-alt);
}

/* Info card */
.info-card {
  margin: 16px;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.info-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  min-width: 72px;
  letter-spacing: 0.2px;
}
.info-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-fg);
  text-align: right;
}
.series-num {
  color: var(--app-gold);
  letter-spacing: 0.5px;
}
.info-badge { font-size: 11px; }

.error-block {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--app-danger-bg);
  border-radius: 8px;
  border: 1px solid var(--app-error-border);
}
.error-block ion-icon { flex-shrink: 0; font-size: 18px; margin-top: 2px; }
.error-block-body { flex: 1; }
.error-block p {
  font-size: 13px;
  color: var(--ion-color-danger);
  margin: 0 0 8px;
  line-height: 1.5;
}
.error-block-fallback { opacity: 0.6; }
.report-btn {
  --border-radius: 7px;
  height: 28px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

/* Section blocks */
.section-block {
  margin: 0 16px 16px;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 6px;
}
.section-header h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--app-fg);
}
.count-badge { font-size: 11px; }

.line-list {
  background: var(--app-surface);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.line-item {
  --padding-start: 12px;
  --inner-padding-end: 12px;
}

.line-name {
  font-size: 14px;
  font-weight: 600;
}
.line-meta {
  font-size: 11px;
  color: var(--app-text-muted);
}
.line-desc {
  font-size: 11px;
  color: var(--app-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.line-price-row {
  font-size: 12px;
  color: var(--ion-color-medium);
}
.line-total {
  font-size: 14px;
  font-weight: 700;
}

.subtotal-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--app-gold-pale);
  border-radius: 0 0 10px 10px;
  border: 1px solid var(--app-border);
  border-top: none;
}
.subtotal-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-fg);
}
.subtotal-value {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--app-gold);
  font-variant-numeric: tabular-nums;
}

/* Grand total */
.grand-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 16px 12px;
  padding: 16px 20px;
  background: var(--app-dark);
  border-radius: var(--app-radius-lg);
  border: 1px solid rgba(160, 115, 32, 0.2);
}
.grand-total-label {
  font-size: var(--text-xs);
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.grand-total-value {
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--app-gold);
  letter-spacing: var(--tracking-tighter);
  font-variant-numeric: tabular-nums;
}

/* Retry */
.retry-wrap {
  padding-top: 8px;
}
.retry-hint {
  font-size: 12px;
  color: var(--app-text-muted);
  text-align: center;
  margin: 8px 0 0;
  line-height: 1.5;
}

/* ── Detail modal content entrance ── */
.info-card      { animation: fade-slide-up 0.32s var(--ease-out-quart) both; }
.section-block  { animation: fade-slide-up 0.32s var(--ease-out-quart) 0.06s both; }
.grand-total-row { animation: fade-slide-up 0.32s var(--ease-out-quart) 0.13s both; }
.retry-wrap     { animation: fade-slide-up 0.32s var(--ease-out-quart) 0.17s both; }

/* ── Minimalist overrides ── */
.history--minimalist .grand-total-row {
  background: #f0f0f0;
  border-color: #e4e4e4;
}
.history--minimalist .grand-total-label { color: rgba(0, 0, 0, 0.4); }
</style>
