import { ref } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same server status state.
const isWarmingUp = ref(false);
const isBusy = ref(false);
const activeBcRequests = ref(0);
const lastChecked = ref<Date | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;

async function checkStatus(): Promise<void> {
  const authStore = useAuthStore();
  const company = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code ?? undefined;
  const status = await ApiService.getApiStatus(company);
  isWarmingUp.value = status.warming_up;
  isBusy.value = status.busy;
  activeBcRequests.value = status.active_bc_requests;
  lastChecked.value = new Date();
  pollCount++;
}

function startPolling(): void {
  if (pollTimer) return;
  // Poll every 2 minutes — cheap endpoint, catches ~90s warmup windows.
  pollTimer = setInterval(checkStatus, 120_000);
  // Fire immediately on first call.
  checkStatus().catch(() => {});
}

function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export function useServerStatus() {
  return {
    isWarmingUp,
    isBusy,
    activeBcRequests,
    lastChecked,
    checkStatus,
    startPolling,
    stopPolling,
  };
}
