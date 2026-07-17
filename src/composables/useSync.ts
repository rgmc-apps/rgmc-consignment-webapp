import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
const syncPhase = ref('');
const syncProgress = ref(0);
const syncSubTasks = ref<{ label: string; status: 'pending' | 'done' | 'error' }[]>([]);
const syncError = ref<string | null>(null);
const syncWarning = ref<string | null>(null);
const lastSyncDate = ref<Date | null>(StorageService.getLastSync());

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

    // Claim the lock synchronously before the first await so no second caller
    // can slip through the isSyncing guard during the checkStatus round-trip.
    isSyncing.value = true;
    syncPhase.value = 'Syncing…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;

    try {
      // Generous timeout for all sync calls — BC list endpoints can take 60-120 s.
      const SYNC_MS = 180_000;

      // All tables shown up-front so the user sees every task from the moment sync starts.
      syncSubTasks.value = [
        { label: 'Customers',       status: 'pending' },
        { label: 'Item Categories', status: 'pending' },
        { label: 'Items & Prices',  status: 'pending' },
        { label: 'Contacts',        status: 'pending' },
      ];

      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // Phase 1 — customers + categories in parallel (0 → 30%). Abort on failure.
      const bump1 = () => { syncProgress.value = Math.min(30, syncProgress.value + 15); };
      const [customers, categories] = await Promise.all([
        ApiService.getCustomers(brandCode, SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[0].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; throw e; }),
        ApiService.getItemCategories(SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[1].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; throw e; }),
      ]);

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItemCategories(categories);
      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('itemCategories');

      // Phase 2 — items + prices from the single v3 item-prices endpoint (30 → 85%).
      // Non-fatal if cached items exist: falls back to last-synced data and surfaces a
      // warning so the user knows prices may be stale. Throws only when there is no
      // cached fallback (first ever sync with no prior data).
      const itemResult = await ApiService.getItemsForDate(today, brandCode, undefined, SYNC_MS)
        .then((r) => { syncProgress.value = Math.min(85, syncProgress.value + 55); syncSubTasks.value[2].status = 'done'; return r; })
        .catch((e) => {
          syncSubTasks.value[2].status = 'error';
          const hasCached = StorageService.getCachedItems().length > 0;
          const is503 = e instanceof Error && (e as { status?: number }).status === 503;
          if (!hasCached && !is503) throw e;  // Unknown error with no fallback — fail hard.
          syncProgress.value = 85;
          return null;              // Signal: use cached data (or warn user to retry).
        });

      if (itemResult !== null) {
        StorageService.setCachedItems(itemResult.items);
        StorageService.setSyncTimestamp('items');
        StorageService.setCachedItemPrices(today, itemResult.priceMap);
        StorageService.applyPriceMapToItems(itemResult.priceMap);
      }

      // Phase 3 — contacts (85 → 100%). Non-critical: failure falls back to cached data
      // and surfaces a warning banner. Item families are fetched live by LoginPage/SplashPage.
      const [contactsResult] = await Promise.allSettled([
        ApiService.getContacts(SYNC_MS)
          .then((r) => { syncSubTasks.value[3].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; throw e; }),
      ]);

      const failedTasks = syncSubTasks.value
        .filter((t) => t.status === 'error')
        .map((t) => t.label);
      if (failedTasks.length) {
        const itemsFailed = itemResult === null;
        const hasCachedItems = StorageService.getCachedItems().length > 0;
        syncWarning.value = itemsFailed
          ? hasCachedItems
            ? `Item prices couldn't be refreshed — showing last synced prices.${failedTasks.length > 1 ? ` Also failed: ${failedTasks.filter((l) => l !== 'Items & Prices').join(', ')}.` : ''} Tap sync to retry.`
            : 'The server is still loading item prices. Please wait a moment and tap sync to retry.'
          : `Some data failed to load: ${failedTasks.join(', ')}. Please sync again when ready.`;
      }

      const contacts = contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : StorageService.getCachedContacts();
      StorageService.setCachedContacts(contacts);

      // Re-apply credentials so login lookups always have the latest username/passwordHash.
      const authUser = authStore.user ?? StorageService.getAuth()?.user;
      if (authUser) {
        const patch: Record<string, string> = {};
        if (authUser.username)     patch['username']     = authUser.username;
        if (authUser.passwordHash) patch['passwordHash'] = authUser.passwordHash;
        if (Object.keys(patch).length) StorageService.patchContact(authUser.id, patch);
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
    sync,
    syncIfStale,
    clearSyncWarning,
  };
}
