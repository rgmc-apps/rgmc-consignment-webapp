<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <div class="header-title">
            <img src="/static/cons-logo.png" alt="logo" class="header-logo" />
            <span>{{ authStore.brand?.displayName ?? 'RGMC' }}</span>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="toggleTheme">
            <ion-icon :key="isDark ? 'dk' : 'lt'" :icon="isDark ? sunnyOutline : moonOutline" slot="icon-only" class="theme-toggle-icon" />
          </ion-button>
          <profile-menu />
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>

      <ion-refresher slot="fixed" @ionRefresh="onPullRefresh($event)">
        <ion-refresher-content
          :pulling-icon="chevronDownCircleOutline"
          pulling-text="Pull to refresh"
          refreshing-spinner="crescent"
          refreshing-text="Refreshing…"
        />
      </ion-refresher>

      <!-- Welcome hero band -->
      <div class="welcome-hero">
        <div class="welcome-hero-inner">
          <span class="welcome-label">Welcome back</span>
          <p class="welcome-name">{{ authStore.user?.displayName }}</p>
          <div class="welcome-date-row">
            <ion-icon :icon="calendarOutline" />
            <span>{{ todayLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Start new session CTA -->
      <div class="ion-padding-horizontal ion-padding-top">
        <ion-button expand="block" size="large" class="start-btn" router-link="/app/scan">
          <ion-icon :icon="scanOutline" slot="start" />
          Start New Session
        </ion-button>
      </div>

      <!-- Pending drafts -->
      <div v-if="visibleDrafts.length > 0">
        <p class="section-label">Pending Drafts</p>
        <ion-list lines="full" class="drafts-list">
          <ion-item
            v-for="draft in visibleDrafts"
            :key="draft.id"
            button
            :detail="false"
            class="draft-item"
            @click="resumeDraft(draft)"
          >
            <div slot="start" class="draft-avatar">{{ draft.customer?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}</div>
            <ion-label class="draft-label">
              <span class="draft-customer">{{ draft.customer?.displayName ?? 'No customer' }}</span>
              <span class="draft-meta">
                <span class="draft-count">{{ draft.salesOrders.length + draft.returnOrders.length }} lines</span>
                <span class="draft-dot">&bull;</span>
                <span class="draft-date">{{ formatDate(draft.updatedAt) }}</span>
              </span>
            </ion-label>
            <!-- Submit shortcut — only for drafts that already have order lines -->
            <ion-button
              v-if="draft.salesOrders.length > 0 || draft.returnOrders.length > 0"
              slot="end"
              fill="solid"
              color="primary"
              size="small"
              class="draft-submit-btn"
              @click.stop="submitDraft(draft)"
            >
              <ion-icon :icon="sendOutline" slot="start" />
              Submit
            </ion-button>
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              size="small"
              @click.stop="confirmDeleteDraft(draft.id)"
            >
              <ion-icon :icon="trashOutline" slot="icon-only" />
            </ion-button>
          </ion-item>
        </ion-list>
      </div>

      <!-- Customers in this brand -->
      <div v-if="customers.length">
        <p class="section-label">
          Customers — {{ authStore.brand?.displayName }}
          <span class="section-count">({{ customers.length }})</span>
        </p>
        <ion-list lines="full" class="customers-list">
          <ion-item v-for="c in customers.slice(0, 8)" :key="c.id" class="customer-item">
            <div slot="start" class="customer-avatar">{{ c.displayName?.charAt(0)?.toUpperCase() ?? '?' }}</div>
            <ion-label>
              <h3 class="customer-name">{{ c.displayName }}</h3>
              <p class="customer-sub">{{ c.number }} &bull; {{ c.city }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="customers.length > 8" lines="none" class="see-more">
            <ion-label color="medium">
              <p>+ {{ customers.length - 8 }} more customers</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <div v-else class="empty-customers">
        <ion-icon :icon="storefrontOutline" color="medium" />
        <p>No customers loaded.<br />Go to Scan and tap Sync to load data.</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
  IonChip,
  IonLabel,
  IonList,
  IonItem,
  alertController,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue';
import {
  calendarOutline,
  scanOutline,
  documentTextOutline,
  trashOutline,
  storefrontOutline,
  sendOutline,
  chevronDownCircleOutline,
  moonOutline,
  sunnyOutline,
} from 'ionicons/icons';
import ProfileMenu from '@/components/ProfileMenu.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';
import { StorageService } from '@/services/storage.service';
import { useCustomerFilter } from '@/composables/useCustomerFilter';
import { useTheme } from '@/composables/useTheme';
import type { Customer, ScanSession } from '@/types';

const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();
const { isDark, toggleTheme } = useTheme();

const visibleDrafts = computed(() => sessionStore.drafts.filter((d) => d.customer !== null));

const allCustomers = ref<Customer[]>([]);
const searchQuery = ref('');

const brandRef = computed(() => authStore.brand);
const allCustomersRef = computed(() => allCustomers.value);
const searchRef = computed(() => searchQuery.value);
const { filteredCustomers: customers } = useCustomerFilter(brandRef, allCustomersRef, searchRef);

const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }),
);

onMounted(() => {
  allCustomers.value = StorageService.getCachedCustomers();
});

function onPullRefresh(ev: CustomEvent) {
  allCustomers.value = StorageService.getCachedCustomers();
  sessionStore.loadFromStorage();
  (ev.target as HTMLIonRefresherElement).complete();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resumeDraft(draft: ScanSession) {
  sessionStore.resumeDraft(draft);
  router.push('/app/scan');
}

/** Resume a draft that already has order lines and go straight to Submit. */
function submitDraft(draft: ScanSession) {
  sessionStore.resumeDraft(draft);
  router.push('/app/submit');
}

async function confirmDeleteDraft(id: string) {
  const alert = await alertController.create({
    header: 'Delete Draft',
    message: 'This draft will be permanently deleted.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => sessionStore.deleteDraft(id),
      },
    ],
  });
  await alert.present();
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

/* ── Welcome hero band ── */
.welcome-hero {
  background: var(--app-dark);
  padding: 20px 20px 26px;
  position: relative;
  overflow: hidden;
  animation: fade-in 0.28s ease both;
}

/* Subtle radial gold ambient glow */
.welcome-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 90% 40%, rgba(160, 115, 32, 0.10) 0%, transparent 65%);
  pointer-events: none;
}

/* Gold separator line at bottom */
.welcome-hero::after {
  content: '';
  position: absolute;
  bottom: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(160, 115, 32, 0.45), transparent);
}

.welcome-hero-inner { position: relative; z-index: 1; }

.welcome-label {
  display: block;
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 5px;
}

.welcome-name {
  font-size: var(--text-hero);
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 14px;
  letter-spacing: var(--tracking-tighter);
  /* Light-on-dark: slightly more leading + a touch of tracking to compensate
     for perceived weight loss on dark backgrounds */
  line-height: var(--leading-snug);
  text-wrap: balance;
}

.welcome-date-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--app-gold-light);
  background: rgba(160, 115, 32, 0.12);
  border: 1px solid rgba(160, 115, 32, 0.25);
  border-radius: 20px;
  padding: 4px 12px 4px 10px;
}
.welcome-date-row ion-icon { font-size: 0.75rem; }

/* ── Start session button ── */
.start-btn {
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.4px;
  border-radius: 14px;
  box-shadow: var(--app-shadow-gold);
  animation: fade-slide-up 0.4s var(--ease-out-quart) 0.07s both;
  transition: transform 0.12s var(--ease-out-expo), box-shadow 0.15s ease;
}
.start-btn:active { transform: scale(0.98); box-shadow: none; }

/* ── Draft list ── */
.drafts-list,
.customers-list {
  background: var(--app-surface);
  margin: 0 0 8px;
}

.draft-item {
  --inner-padding-start: 0;
  --background: rgba(255, 196, 9, 0.04);
}

.draft-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 196, 9, 0.10);
  border: 1px solid rgba(255, 196, 9, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  color: #d4a017;
  flex-shrink: 0;
  margin-right: 2px;
}

.draft-label {
  display: flex !important;
  flex-direction: column;
  gap: 2px;
}

.draft-customer {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--app-fg);
  line-height: var(--leading-snug);
}

.draft-meta {
  display: flex;
  align-items: center;
  gap: 5px;
}

.draft-count {
  font-size: var(--text-2xs);
  font-weight: 700;
  background: rgba(160, 115, 32, 0.12);
  color: var(--app-gold);
  border-radius: 4px;
  padding: 1px 6px;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.draft-dot {
  font-size: var(--text-2xs);
  color: var(--app-text-muted);
  opacity: 0.4;
}

.draft-date {
  font-size: var(--text-xs);
  color: var(--app-text-muted);
}

.draft-submit-btn {
  --border-radius: 8px;
  height: 30px;
  font-size: 11px;
  font-weight: 700;
  margin-right: 4px;
}

/* ── Customer list ── */
.customer-item { --inner-padding-start: 0; }

.customer-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--app-gold-pale);
  border: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-gold-dark);
  flex-shrink: 0;
  margin-right: 2px;
}

.customer-name {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: var(--app-fg) !important;
}

.customer-sub {
  font-size: 12px !important;
  color: var(--app-text-muted) !important;
}

.section-count {
  font-weight: 400;
  color: var(--app-gold);
}

.see-more { --min-height: 36px; }
.see-more p { font-size: 13px; text-align: center; }

/* ── Empty state ── */
.empty-customers {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  gap: 12px;
  animation: fade-in 0.3s ease both;
}
.empty-customers ion-icon { font-size: 48px; }
.empty-customers p {
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

/* ── List entrance stagger ── */
.drafts-list ion-item:nth-child(1) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.04s both; }
.drafts-list ion-item:nth-child(2) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.08s both; }
.drafts-list ion-item:nth-child(3) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.12s both; }
.drafts-list ion-item:nth-child(4) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.16s both; }

.customers-list ion-item:nth-child(1) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.05s both; }
.customers-list ion-item:nth-child(2) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.09s both; }
.customers-list ion-item:nth-child(3) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.13s both; }
.customers-list ion-item:nth-child(4) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.17s both; }
.customers-list ion-item:nth-child(5) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.21s both; }
.customers-list ion-item:nth-child(6) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.25s both; }
.customers-list ion-item:nth-child(7) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.29s both; }
.customers-list ion-item:nth-child(8) { animation: fade-slide-up 0.28s var(--ease-out-quart) 0.33s both; }
</style>
