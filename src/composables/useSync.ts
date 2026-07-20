import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
const syncPhase = ref('');
const syncProgress = ref(0);
const syncSubTasks = ref<{ label: string; status: 'pending' | 'done' | 'error'; detail?: string }[]>([]);
const syncError = ref<string | null>(null);
const syncWarning = ref<string | null>(null);
const lastSyncDate = ref<Date | null>(StorageService.getLastSync());
const syncItemsLoaded = ref(0);
const syncItemsTotal = ref(0);

export function useSync() {

  const lastSyncLabel = computed(() => {
    if (!lastSyncDate.value) return 'Never synced';
    const d = lastSyncDate.value;
    return d.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  async function sync(): Promise<void> {
    if (isSyncing.value) return;
    if (!navigator.onLine) return;

    isSyncing.value = true;
    syncPhase.value = 'Syncing…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;
    syncItemsLoaded.value = 0;
    syncItemsTotal.value = 0;

    syncSubTasks.value = [
      { label: 'Customers',       status: 'pending' },
      { label: 'Item Categories', status: 'pending' },
      { label: 'Items & Prices',  status: 'pending' },
      { label: 'Contacts',        status: 'pending' },
    ];

    try {
      const TIMEOUT = 180_000;
      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // All 4 tasks run in parallel. The backend blocks internally until the
      // item catalog is warm (up to 55 s), so no frontend pagination needed.
      let done = 0;
      const bump = () => { syncProgress.value = Math.round((++done / 4) * 100); };

      const [customersResult, categoriesResult, itemsResult, contactsResult] = await Promise.allSettled([
        ApiService.getCustomers(brandCode, TIMEOUT)
          .then((r) => { syncSubTasks.value[0].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; bump(); throw e; }),
        ApiService.getItemCategories(TIMEOUT)
          .then((r) => { syncSubTasks.value[1].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; bump(); throw e; }),
        ApiService.getItemsForDate(today, undefined, undefined, TIMEOUT)
          .then((r) => {
            syncSubTasks.value[2].status = 'done';
            syncSubTasks.value[2] = { ...syncSubTasks.value[2], detail: `${r.items.length.toLocaleString()}` };
            syncItemsLoaded.value = r.items.length;
            syncItemsTotal.value = r.items.length;
            bump();
            return r;
          })
          .catch((e) => { syncSubTasks.value[2].status = 'error'; bump(); throw e; }),
        ApiService.getContacts(TIMEOUT)
          .then((r) => { syncSubTasks.value[3].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; bump(); throw e; }),
      ]);

      if (customersResult.status === 'fulfilled') {
        StorageService.setCachedCustomers(customersResult.value);
        StorageService.setSyncTimestamp('customers');
      }
      if (categoriesResult.status === 'fulfilled') {
        StorageService.setCachedItemCategories(categoriesResult.value);
        StorageService.setSyncTimestamp('itemCategories');
      }
      if (itemsResult.status === 'fulfilled') {
        const { items, priceMap } = itemsResult.value;
        StorageService.setCachedItems(items);
        StorageService.setSyncTimestamp('items');
        StorageService.setCachedItemPrices(today, priceMap);
        StorageService.applyPriceMapToItems(priceMap);
      }

      const contacts = contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : StorageService.getCachedContacts();
      StorageService.setCachedContacts(contacts);

      if (contactsResult.status === 'fulfilled') {
        const authUser = authStore.user ?? StorageService.getAuth()?.user;
        if (authUser) {
          const patch: Record<string, string> = {};
          if (authUser.username)     patch['username']     = authUser.username;
          if (authUser.passwordHash) patch['passwordHash'] = authUser.passwordHash;
          if (Object.keys(patch).length) StorageService.patchContact(authUser.id, patch);
        }
      }

      const failedTasks = syncSubTasks.value.filter((t) => t.status === 'error').map((t) => t.label);
      if (failedTasks.length) {
        const itemsFailed = itemsResult.status === 'rejected';
        const hasCachedItems = StorageService.getCachedItems().length > 0;
        syncWarning.value = itemsFailed
          ? hasCachedItems
            ? `Item prices couldn't be refreshed — showing last synced prices. Tap sync to retry.`
            : 'The server is still loading item prices. Please wait a moment and tap sync to retry.'
          : `Some data failed to load: ${failedTasks.join(', ')}. Please sync again when ready.`;
      }

      if (itemsResult.status === 'rejected' && StorageService.getCachedItems().length === 0) {
        throw (itemsResult as PromiseRejectedResult).reason;
      }

      syncProgress.value = 100;
      lastSyncDate.value = new Date();
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : 'Sync failed. Check your connection.';
    } finally {
      syncPhase.value = '';
      syncSubTasks.value = [];
      isSyncing.value = false;
    }
  }

  async function syncIfStale(maxAgeHours = 24): Promise<void> {
    if (!lastSyncDate.value) {
      await sync();
      return;
    }
    const ageMs = Date.now() - lastSyncDate.value.getTime();
    if (ageMs > maxAgeHours * 60 * 60 * 1000) {
      await sync();
    }
  }

  function clearSyncWarning(): void {
    syncWarning.value = null;
    syncError.value = null;
  }

  return {
    isSyncing,
    syncPhase,
    syncProgress,
    syncSubTasks,
    syncError,
    syncWarning,
    lastSyncDate,
    lastSyncLabel,
    syncItemsLoaded,
    syncItemsTotal,
    sync,
    syncIfStale,
    clearSyncWarning,
  };
}
