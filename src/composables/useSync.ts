import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
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
    syncError.value = null;

    try {
      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;

      // Fetch customers and items filtered by current brand in parallel with other critical data.
      const [customers, rawItems, categories] = await Promise.all([
        ApiService.getCustomers(brandCode),
        ApiService.getItems(brandCode),
        ApiService.getItemCategories(),
      ]);

      // Client-side guard: drop any items that slipped through without a matching familyCode.
      const items = brandCode
        ? rawItems.filter((i) => i.familyCode === brandCode)
        : rawItems;

      // Non-critical fetches — falls back to cached values if the endpoint is unavailable.
      const [familiesResult, contactsResult] = await Promise.allSettled([
        ApiService.getItemFamilies(),
        ApiService.getContacts(),
      ]);
      const families = familiesResult.status === 'fulfilled' ? familiesResult.value : [];
      const contacts = contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : StorageService.getCachedContacts();

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItems(items);
      StorageService.setCachedItemCategories(categories);
      StorageService.setCachedContacts(contacts);

      // Re-apply credentials so login lookups always have the latest username/passwordHash.
      const authUser = authStore.user ?? StorageService.getAuth()?.user;
      if (authUser) {
        const patch: Record<string, string> = {};
        if (authUser.username)     patch['username']     = authUser.username;
        if (authUser.passwordHash) patch['passwordHash'] = authUser.passwordHash;
        if (Object.keys(patch).length) StorageService.patchContact(authUser.id, patch);
      }

      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('items');
      StorageService.setSyncTimestamp('itemCategories');

      // Price lookup scoped to the current brand's item family.
      // Non-critical: a failure here does not abort the rest of the sync.
      try {
        const today = new Date().toISOString().split('T')[0];
        const itemNumbers = items.map((i) => i.number);
        const priceMap = await ApiService.getAllItemPricesForDate(today, itemNumbers);
        const finalPriceMap: Record<string, number> = {};
        for (const item of items) {
          finalPriceMap[item.number] = priceMap[item.number] ?? item.unitPriceIncVAT;
        }
        StorageService.setCachedItemPrices(today, finalPriceMap);
        StorageService.applyPriceMapToItems(finalPriceMap);
      } catch {
        // ignored — prices fall back to item.unitPriceIncVAT when offline
      }

      lastSyncDate.value = new Date();
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : 'Sync failed. Check your connection.';
    } finally {
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
    syncError,
    lastSyncDate,
    lastSyncLabel,
    sync,
    syncIfStale,
  };
}
