import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
const syncPhase = ref('');
const syncError = ref<string | null>(null);
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
    syncError.value = null;

    try {
      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // Phase 1 — critical master data.
      const [customers, rawItems, categories] = await Promise.all([
        ApiService.getCustomers(brandCode),
        ApiService.getItems(brandCode),
        ApiService.getItemCategories(),
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

      // Phase 2 — contacts, families, and item prices run in parallel.
      // All three are non-critical: failures fall back to cached data.
      syncPhase.value = 'Loading prices & contacts…';
      const [familiesResult, contactsResult, pricesResult] = await Promise.allSettled([
        ApiService.getItemFamilies(),
        ApiService.getContacts(),
        ApiService.getAllItemPricesForDate(today, items.map((i) => i.number)),
      ]);

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

      lastSyncDate.value = new Date();
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : 'Sync failed. Check your connection.';
    } finally {
      syncPhase.value = '';
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

  return {
    isSyncing,
    syncPhase,
    syncError,
    lastSyncDate,
    lastSyncLabel,
    sync,
    syncIfStale,
  };
}
