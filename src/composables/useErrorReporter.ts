import { useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/api.service';

const REPORT_BASE = `${import.meta.env.VITE_GATEWAY_URL ?? 'https://rgmc-gateway-935246372408.asia-southeast1.run.app'}/report-issue`;

export interface ReportContext {
  error?: unknown;
  context?: string;
  payload?: unknown;
}

export function useErrorReporter() {
  function openReport({ error, context, payload }: ReportContext = {}): void {
    const authStore = useAuthStore();

    const lines: string[] = ['[RGMC Consignment App Bug Report]'];
    lines.push(`Time     : ${new Date().toISOString()}`);

    if (authStore.user?.displayName) lines.push(`User     : ${authStore.user.displayName}`);
    if (authStore.brand?.displayName) lines.push(`Brand    : ${authStore.brand.displayName}`);
    if (authStore.company?.displayName) lines.push(`Company  : ${authStore.company.displayName}`);
    if (context) lines.push(`Context  : ${context}`);

    if (error instanceof ApiError) {
      if (error.status)   lines.push(`HTTP     : ${error.status}`);
      if (error.method && error.endpoint) lines.push(`Request  : ${error.method} ${error.endpoint}`);
      lines.push(`Error    : ${error.message}`);
    } else if (error instanceof Error) {
      lines.push(`Error    : ${error.message}`);
    } else if (error !== undefined && error !== null) {
      lines.push(`Error    : ${String(error)}`);
    }

    const screen = window.location.pathname;
    lines.push(`Page     : ${screen}`);
    lines.push(`UA       : ${navigator.userAgent.slice(0, 80)}`);

    const url = new URL(REPORT_BASE);
    url.searchParams.set('system', 'rgmc-consignment-app');
    url.searchParams.set('error', lines.join('\n'));

    const apiBody = error instanceof ApiError ? error.body : undefined;
    const resolvedPayload = payload ?? apiBody;
    if (resolvedPayload != null || apiBody != null) {
      const payloadObj = {
        screen,
        ...(resolvedPayload != null
          ? (typeof resolvedPayload === 'object' && resolvedPayload !== null
              ? (resolvedPayload as object)
              : { data: resolvedPayload })
          : {}),
      };
      url.searchParams.set('payload', JSON.stringify(payloadObj));
    }
    window.open(url.toString(), '_blank');
  }

  return { openReport };
}
