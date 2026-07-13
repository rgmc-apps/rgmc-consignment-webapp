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
    syncPhase.value = 'Fetching items & customers…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;

    try {
      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // Phase 1 — critical master data (0 → 45%).
      const bump1 = () => { syncProgress.value = Math.min(45, syncProgress.value + 15); };
      const [customers, rawItems, categories] = await Promise.all([
        ApiService.getCustomers(brandCode).then((r) => { bump1(); return r; }),
        ApiService.getItems(brandCode).then((r) => { bump1(); return r; }),
        ApiService.getItemCategories().then((r) => { bump1(); return r; }),
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

      // Phase 2 — contacts, families, and item prices run in parallel (45 → 100%).
      // All three are non-critical: failures fall back to cached data.
      syncPhase.value = 'Fetching…';
      syncSubTasks.value = [
        { label: 'Contacts', status: 'pending' },
        { label: 'Item Prices', status: 'pending' },
      ];

      // When a brandCode is available use the familyCode filter — one BC call instead
      // of N/50 chunked calls. Fall back to chunked product-number batches otherwise.
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

      const [familiesResult, contactsResult, pricesResult] = await Promise.allSettled([
        ApiService.getItemFamilies(),
        ApiService.getContacts()
          .then((r) => { syncSubTasks.value[0].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; throw e; }),
        pricesCall
          .then((r) => { syncSubTasks.value[1].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; throw e; }),
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
