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
          <ion-button fill="clear" @click="handleLogout">
            <ion-icon :icon="logOutOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>

      <ion-refresher slot="fixed" @ionRefresh="onPullRefresh($event)">
        <ion-refresher-content
          pulling-icon="chevron-down-circle-outline"
          pulling-text="Pull to refresh"
          refreshing-spinner="crescent"
          refreshing-text="Refreshing…"
        />
      </ion-refresher>

      <!-- Welcome strip -->
      <div class="welcome-strip">
        <div>
          <p class="welcome-greeting">Welcome back,</p>
          <p class="welcome-name">{{ authStore.user?.displayName }}</p>
        </div>
        <ion-chip color="primary" class="date-chip">
          <ion-icon :icon="calendarOutline" />
          <ion-label>{{ todayLabel }}</ion-label>
        </ion-chip>
      </div>

      <!-- Start new session CTA -->
      <div class="ion-padding-horizontal ion-padding-top">
        <ion-button expand="block" size="large" class="start-btn" router-link="/app/scan">
          <ion-icon :icon="scanOutline" slot="start" />
          Start New Session
        </ion-button>
      </div>

      <!-- Pending drafts -->
      <div v-if="sessionStore.hasDrafts">
        <p class="section-label">Pending Drafts</p>
        <ion-list lines="full" class="drafts-list">
          <ion-item
            v-for="draft in sessionStore.drafts"
            :key="draft.id"
            button
            detail
            @click="resumeDraft(draft)"
          >
            <ion-icon :icon="documentTextOutline" slot="start" color="warning" />
            <ion-label>
              <h3>{{ draft.customer?.displayName ?? 'No customer selected' }}</h3>
              <p>
                {{ draft.salesOrders.length }} sales &bull;
                {{ draft.returnOrders.length }} returns &bull;
                {{ formatDate(draft.updatedAt) }}
              </p>
            </ion-label>
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
          <ion-item v-for="c in customers.slice(0, 8)" :key="c.id">
            <ion-icon :icon="storefrontOutline" slot="start" color="medium" />
            <ion-label>
              <h3>{{ c.displayName }}</h3>
              <p>{{ c.number }} &bull; {{ c.city }}</p>
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
  logOutOutline,
  calendarOutline,
  scanOutline,
  documentTextOutline,
  trashOutline,
  storefrontOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';
import { StorageService } from '@/services/storage.service';
import { useCustomerFilter } from '@/composables/useCustomerFilter';
import type { Customer, ScanSession } from '@/types';

const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();

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

async function handleLogout() {
  const alert = await alertController.create({
    header: 'Sign Out',
    message: 'Are you sure you want to sign out?',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Sign Out',
        handler: () => {
          authStore.logout();
          router.replace('/login');
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
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

.welcome-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
  animation: fade-in 0.28s ease both;
}

.welcome-greeting {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted);
}

.welcome-name {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-dark);
}

.date-chip {
  font-size: 12px;
  height: 28px;
}

.start-btn {
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  height: 54px;
  font-size: 17px;
  font-weight: 700;
  border-radius: 12px;
  animation: fade-slide-up 0.4s var(--ease-out-quart) 0.07s both;
  transition: transform 0.12s var(--ease-out-expo);
}

.start-btn:active {
  transform: scale(0.98);
}

.drafts-list,
.customers-list {
  background: var(--app-surface);
  margin: 0 0 8px;
}

.section-count {
  font-weight: 400;
  color: var(--app-gold);
}

.see-more {
  --min-height: 36px;
}

.see-more p {
  font-size: 13px;
  text-align: center;
}

.empty-customers {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  gap: 12px;
  animation: fade-in 0.3s ease both;
}

/* Draft list — stagger entrance */
.drafts-list ion-item:nth-child(1) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.04s both; }
.drafts-list ion-item:nth-child(2) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.07s both; }
.drafts-list ion-item:nth-child(3) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.10s both; }
.drafts-list ion-item:nth-child(4) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.13s both; }

/* Customer list — stagger entrance */
.customers-list ion-item:nth-child(1) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.05s both; }
.customers-list ion-item:nth-child(2) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.08s both; }
.customers-list ion-item:nth-child(3) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.11s both; }
.customers-list ion-item:nth-child(4) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.14s both; }
.customers-list ion-item:nth-child(5) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.17s both; }
.customers-list ion-item:nth-child(6) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.20s both; }
.customers-list ion-item:nth-child(7) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.23s both; }
.customers-list ion-item:nth-child(8) { animation: fade-slide-up 0.30s var(--ease-out-quart) 0.26s both; }

.empty-customers ion-icon {
  font-size: 48px;
}

.empty-customers p {
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1.6;
}
</style>
