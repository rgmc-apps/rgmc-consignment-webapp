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

      // Tasks run sequentially to limit concurrent BC connections to 1 per user.
      // Each task updates its subtask status and bumps progress as it completes.
      let done = 0;
      const bump = () => { syncProgress.value = Math.round((++done / 4) * 100); };
      const settle = <T>(p: Promise<T>): Promise<PromiseSettledResult<T>> =>
        p.then((value) => ({ status: 'fulfilled' as const, value }), (reason) => ({ status: 'rejected' as const, reason }));

      const customersResult = await settle(
        ApiService.getCustomers(brandCode, TIMEOUT)
          .then((r) => { syncSubTasks.value[0].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; bump(); throw e; }),
      );

      const categoriesResult = await settle(
        ApiService.getItemCategories(TIMEOUT)
          .then((r) => { syncSubTasks.value[1].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; bump(); throw e; }),
      );

      const itemsResult = await settle(
        (async () => {
          const PAGE_SIZE = 500;
          const first = await ApiService.getItemsPaged(today, 0, PAGE_SIZE, undefined, TIMEOUT, brandCode);
          const total = first.total || first.items.length;
          syncItemsTotal.value = total;

          const accItems = [...first.items];
          const accPriceMap = { ...first.priceMap };
          const seen = new Set(accItems.map((i) => i.number));
          syncItemsLoaded.value = accItems.length;
          syncSubTasks.value[2] = {
            ...syncSubTasks.value[2],
            detail: `${accItems.length.toLocaleString()} / ${total.toLocaleString()}`,
          };

          for (let skip = PAGE_SIZE; skip < total; skip += PAGE_SIZE) {
            const page = await ApiService.getItemsPaged(today, skip, PAGE_SIZE, undefined, TIMEOUT, brandCode);
            if (page.items.length === 0) break;
            for (const item of page.items) {
              if (!seen.has(item.number)) {
                seen.add(item.number);
                accItems.push(item);
                accPriceMap[item.number] = item.unitPriceIncVAT;
              }
            }
            syncItemsLoaded.value = accItems.length;
            syncSubTasks.value[2] = {
              ...syncSubTasks.value[2],
              detail: `${accItems.length.toLocaleString()} / ${total.toLocaleString()}`,
            };
          }

          return { items: accItems, priceMap: accPriceMap };
        })()
          .then((r) => {
            syncSubTasks.value[2].status = 'done';
            syncSubTasks.value[2] = { ...syncSubTasks.value[2], detail: `${r.items.length.toLocaleString()}` };
            syncItemsLoaded.value = r.items.length;
            syncItemsTotal.value = r.items.length;
            bump();
            return r;
          })
          .catch((e) => { syncSubTasks.value[2].status = 'error'; bump(); throw e; }),
      );

      const contactsResult = await settle(
        ApiService.getContacts(TIMEOUT)
          .then((r) => { syncSubTasks.value[3].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; bump(); throw e; }),
      );

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
