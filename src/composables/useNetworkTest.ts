import { ref } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

interface NetworkInformation extends EventTarget {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface NetworkTestSample {
  ok: boolean;
  ms: number;
}

export interface NetworkTestResult {
  ranAt: Date;
  samples: NetworkTestSample[];
  /** First round trip — the one most likely to catch a Cloud Run cold start. */
  firstMs: number | null;
  /** Average of the remaining pings, once the server (if it was cold) has spun up. */
  steadyAvgMs: number | null;
  warmingUp: boolean;
  busy: boolean;
  activeBcRequests: number;
  connectionType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
  online: boolean;
}

// 4 pings against the same cheap status endpoint useServerStatus already polls —
// the first one is the sample that reveals a cold start, the rest establish a
// steady-state baseline so the user (and whoever reads their bug report) can tell
// "the server had to wake up" apart from "my connection is actually slow".
const SAMPLE_COUNT = 4;

const isTesting = ref(false);
const lastResult = ref<NetworkTestResult | null>(null);

async function runNetworkTest(): Promise<NetworkTestResult> {
  isTesting.value = true;
  try {
    const authStore = useAuthStore();
    const company = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code ?? undefined;

    const samples: NetworkTestSample[] = [];
    let warmingUp = false;
    let busy = false;
    let activeBcRequests = 0;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t0 = performance.now();
      const status = await ApiService.getApiStatus(company);
      const ms = performance.now() - t0;
      samples.push({ ok: ms < 5000, ms: Math.round(ms) });
      warmingUp = status.warming_up;
      busy = status.busy;
      activeBcRequests = status.active_bc_requests;
    }

    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const steadySamples = samples.slice(1);

    const result: NetworkTestResult = {
      ranAt: new Date(),
      samples,
      firstMs: samples[0]?.ms ?? null,
      steadyAvgMs: steadySamples.length
        ? Math.round(steadySamples.reduce((sum, s) => sum + s.ms, 0) / steadySamples.length)
        : null,
      warmingUp,
      busy,
      activeBcRequests,
      connectionType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? null,
      saveData: !!conn?.saveData,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
    lastResult.value = result;
    return result;
  } finally {
    isTesting.value = false;
  }
}

export function useNetworkTest() {
  return { isTesting, lastResult, runNetworkTest };
}
