import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

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
      const [customers, items, categories, brands, families, contacts] = await Promise.all([
        ApiService.getCustomers(),
        ApiService.getItems(),
        ApiService.getItemCategories(),
        ApiService.getBrands(),
        ApiService.getItemFamilies(),
        ApiService.getContacts(),
      ]);

      const enrichedBrands = brands.map((b) => ({
        ...b,
        itemFamilyCode: families.find((f) => f.description === b.displayName)?.code,
      }));

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItems(items);
      StorageService.setCachedItemCategories(categories);
      StorageService.setCachedBrands(enrichedBrands);
      StorageService.setCachedContacts(contacts);
      // Re-apply credentials for the authenticated user in case the API
      // doesn't return username/passwordHash and the previous cache was empty.
      const authSession = StorageService.getAuth();
      if (authSession) {
        const { id, username, passwordHash } = authSession.user;
        const patch: Record<string, string> = {};
        if (username)     patch['username']     = username;
        if (passwordHash) patch['passwordHash'] = passwordHash;
        if (Object.keys(patch).length) StorageService.patchContact(id, patch);
      }
      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('items');
      StorageService.setSyncTimestamp('itemCategories');

      // Pre-load item prices for today scoped to the user's item family.
      // Sends only the family's product numbers so BC returns the minimum rows.
      // Explicitly builds the final price map: price-list price if found, else
      // the item's base BC price — so items with no price entry are not left
      // at a stale value from a previous sync.
      // Non-critical: a failure here does not abort the rest of the sync.
      try {
        const today = new Date().toISOString().split('T')[0];
        const familyCode = StorageService.getAuth()?.brand?.itemFamilyCode;
        const familyItems = familyCode
          ? items.filter((i) => i.familyCode === familyCode)
          : items;
        const productNos = familyItems.map((i) => i.number);
        const priceMap = await ApiService.getAllItemPricesForDate(today, productNos);
        const finalPriceMap: Record<string, number> = {};
        for (const item of familyItems) {
          finalPriceMap[item.number] = priceMap[item.number] ?? item.unitPrice;
        }
        StorageService.setCachedItemPrices(today, finalPriceMap);
        StorageService.applyPriceMapToItems(finalPriceMap);
      } catch {
        // ignored — prices fall back to item.unitPrice when offline
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
