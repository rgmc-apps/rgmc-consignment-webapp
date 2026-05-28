import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

export function useSync() {
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const lastSyncDate = ref<Date | null>(StorageService.getLastSync());

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
    isSyncing.value = true;
    syncError.value = null;

    try {
      const [customers, items, categories, brands, contacts] = await Promise.all([
        ApiService.getCustomers(),
        ApiService.getItems(),
        ApiService.getItemCategories(),
        ApiService.getBrands(),
        ApiService.getContacts(),
      ]);

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItems(items);       // writes IDB in background
      StorageService.setCachedItemCategories(categories);
      StorageService.setCachedBrands(brands);
      StorageService.setCachedContacts(contacts);
      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('items');
      StorageService.setSyncTimestamp('itemCategories');

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
