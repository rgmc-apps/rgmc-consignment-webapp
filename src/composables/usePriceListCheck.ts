import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

const OPEN_DATE = '0001-01-01';

export type PriceListAlertType = 'expired' | 'new-available';

export interface PriceListAlert {
  type: PriceListAlertType;
  codes: string[];
  message: string;
}

// Module-level singleton — all components share the same check state.
const alerts = ref<PriceListAlert[]>([]);
const isChecking = ref(false);
const isDismissed = ref(false);

export function usePriceListCheck() {
  const hasAlerts = computed(() => alerts.value.length > 0 && !isDismissed.value);

  async function check(): Promise<void> {
    if (isChecking.value) return;
    isChecking.value = true;
    isDismissed.value = false;
    try {
      const headers = await ApiService.getPriceListHeaderCatalog('Active', 'Sale');
      if (!headers.length) {
        alerts.value = [];
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const cached = StorageService.getCachedItemPrices();
      const cachedDate = cached?.date ?? today;

      const next: PriceListAlert[] = [];

      // Price lists whose endingDate has passed — prices based on them are stale.
      const expired = headers.filter(
        (h) => h.endingDate && h.endingDate !== OPEN_DATE && h.endingDate < today,
      );
      if (expired.length) {
        next.push({
          type: 'expired',
          codes: expired.map((h) => h.code),
          message:
            expired.length === 1
              ? `Price list ${expired[0].code} has expired. Sync to apply the latest prices.`
              : `${expired.length} price lists have expired. Sync to apply the latest prices.`,
        });
      }

      // Price lists that became effective after the date used in the last sync —
      // our cached prices don't reflect them yet.
      const newer = headers.filter(
        (h) => h.startingDate && h.startingDate !== OPEN_DATE && h.startingDate > cachedDate,
      );
      if (newer.length) {
        next.push({
          type: 'new-available',
          codes: newer.map((h) => h.code),
          message:
            newer.length === 1
              ? `New price list ${newer[0].code} is now active. Sync to load updated prices.`
              : `${newer.length} new price lists are now active. Sync to load updated prices.`,
        });
      }

      alerts.value = next;
    } catch {
      // Silently ignore — price list check is advisory only.
    } finally {
      isChecking.value = false;
    }
  }

  function dismiss(): void {
    isDismissed.value = true;
  }

  return { alerts, hasAlerts, isChecking, check, dismiss };
}
