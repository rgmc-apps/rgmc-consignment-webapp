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
    isSyncing.value = true;
    syncPhase.value = 'Syncing…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;

    // Generous timeout for all sync calls — BC list endpoints can take 60-120 s.
    const SYNC_MS = 180_000;

    // All tables shown up-front so the user sees every task from the moment sync starts.
    syncSubTasks.value = [
      { label: 'Customers',       status: 'pending' },
      { label: 'Items',           status: 'pending' },
      { label: 'Item Categories', status: 'pending' },
      { label: 'Contacts',        status: 'pending' },
      { label: 'Item Prices',     status: 'pending' },
      { label: 'Item Families',   status: 'pending' },
    ];

    try {
      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // Phase 1 — critical master data (0 → 45%). Any failure aborts the whole sync.
      const bump1 = () => { syncProgress.value = Math.min(45, syncProgress.value + 15); };
      const [customers, rawItems, categories] = await Promise.all([
        ApiService.getCustomers(brandCode, SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[0].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; throw e; }),
        ApiService.getItems(brandCode, SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[1].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; throw e; }),
        ApiService.getItemCategories(SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[2].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[2].status = 'error'; throw e; }),
      ]);

      const items = brandCode
        ? rawItems.filter((i) => i.familyCode === brandCode)
        : rawItems;

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItems(items);
      StorageService.setCachedItemCategories(categories);
      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('items');
      StorageService.setSyncTimestamp('itemCategories');

      // Phase 2 — contacts, item prices, and item families in parallel (45 → 100%).
      // Non-critical: failures fall back to cached data and set a warning banner.
      let pricesCall: Promise<Record<string, number>>;
      if (brandCode) {
        const bumpPrice = () => { syncProgress.value = Math.min(99, syncProgress.value + 55); };
        pricesCall = ApiService.getAllItemPricesForDate(today, [], undefined, bumpPrice, brandCode);
      } else {
        const totalChunks = Math.max(1, Math.ceil(items.length / 50));
        const priceStep = Math.round(55 / totalChunks);
        const bumpPrice = () => { syncProgress.value = Math.min(99, syncProgress.value + priceStep); };
        pricesCall = ApiService.getAllItemPricesForDate(today, items.map((i) => i.number), undefined, bumpPrice);
      }

      const [contactsResult, pricesResult, familiesResult] = await Promise.allSettled([
        ApiService.getContacts(SYNC_MS)
          .then((r) => { syncSubTasks.value[3].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; throw e; }),
        pricesCall
          .then((r) => { syncSubTasks.value[4].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[4].status = 'error'; throw e; }),
        ApiService.getItemFamilies(SYNC_MS)
          .then((r) => { syncSubTasks.value[5].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[5].status = 'error'; throw e; }),
      ]);

      const failedTasks = syncSubTasks.value
        .filter((t) => t.status === 'error')
        .map((t) => t.label);
      if (failedTasks.length) {
        syncWarning.value = `Some data failed to load: ${failedTasks.join(', ')}. Please sync again when ready.`;
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

      // Apply today's prices to the item cache.
      if (pricesResult.status === 'fulfilled') {
        const priceMap = pricesResult.value;
        const finalPriceMap: Record<string, number> = {};
        for (const item of items) {
          finalPriceMap[item.number] = priceMap[item.number] ?? item.unitPriceIncVAT;
        }
        StorageService.setCachedItemPrices(today, finalPriceMap);
        StorageService.applyPriceMapToItems(finalPriceMap);
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
