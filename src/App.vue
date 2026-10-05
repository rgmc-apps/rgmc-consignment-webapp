<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { IonApp, IonRouterOutlet, toastController } from '@ionic/vue';
import { StorageService } from '@/services/storage.service';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useGoldAccent } from '@/composables/useGoldAccent';
import { useSync } from '@/composables/useSync';
import { useSlowLoadingWatcher } from '@/composables/useSlowLoadingWatcher';
import { useErrorReporter } from '@/composables/useErrorReporter';

const { isOnline } = useNetworkStatus();
const { triggerHeaderPulse } = useGoldAccent();
const { sync, isSyncing } = useSync();
const { isSlow, slowUrl, dismissIncident } = useSlowLoadingWatcher();
const { openReport } = useErrorReporter();

/** Turns a raw request path into the kind of label a non-technical user (and the
 *  IT/MIS team reading the report) will recognize, for the pre-filled report title. */
function friendlyEndpointLabel(url: string | null): string {
  const path = (url ?? '').split('?')[0];
  const rules: [RegExp, string][] = [
    [/company-settings/, 'Company List'],
    [/\/bc\/brands/, 'Brands'],
    [/item-prices/, 'Item Prices'],
    [/item-categories/, 'Item Categories'],
    [/item-families/, 'Item Families'],
    [/price-list-headers/, 'Price Lists'],
    [/\/bc\/custom\/v2\/contacts/, 'Contacts'],
    [/\/bc\/custom\/v2\/customers/, 'Customers'],
    [/sales-return-orders/, 'Return Orders'],
    [/sales-orders/, 'Sales Orders'],
    [/session-history/, 'Session History'],
    [/\/tasks\//, 'Order Status'],
  ];
  for (const [re, label] of rules) if (re.test(path)) return label;
  return 'the App';
}

// Kept so the toast can be dismissed programmatically if the slow operation resolves
// on its own (e.g. a retry sequence finally succeeds) while the user hasn't tapped
// either button yet — otherwise a duration:0 toast would sit there stale.
let slowToast: HTMLIonToastElement | null = null;

watch(isSlow, async (slow) => {
  if (!slow) {
    if (slowToast) { slowToast.dismiss(); slowToast = null; }
    return;
  }
  const label = friendlyEndpointLabel(slowUrl.value);
  const toast = await toastController.create({
    message: 'Still experiencing slow loading?',
    duration: 0,
    position: 'top',
    color: 'warning',
    buttons: [
      {
        text: 'Report Issue',
        side: 'end',
        handler: () => {
          dismissIncident();
          openReport({
            title: `Slow Loading of ${label}`,
            context: `Loading has taken longer than 5 minutes (${label}).`,
          });
        },
      },
      {
        text: 'Dismiss',
        role: 'cancel',
        handler: () => dismissIncident(),
      },
    ],
  });
  toast.addEventListener('didDismiss', () => { slowToast = null; }, { once: true });
  slowToast = toast;
  await toast.present();
});

let prevOnline = isOnline.value;
watch(isOnline, async (online) => {
  if (prevOnline && !online) {
    const toast = await toastController.create({
      message: "You're offline — the app continues in offline mode. Submitting orders requires a connection.",
      duration: 4500,
      position: 'top',
      cssClass: 'offline-toast',
      color: 'dark',
    });
    await toast.present();
  } else if (!prevOnline && online) {
    triggerHeaderPulse();
    const toast = await toastController.create({
      message: "Back online — connection restored.",
      duration: 5000,
      position: 'top',
      cssClass: 'online-toast',
      color: 'success',
      buttons: [
        {
          text: 'Sync Now',
          side: 'end',
          handler: () => {
            if (!isSyncing.value) {
              sync().then(async () => {
                const done = await toastController.create({
                  message: 'Data synced successfully.',
                  duration: 2500,
                  position: 'top',
                  color: 'success',
                });
                await done.present();
              }).catch(async () => {
                const err = await toastController.create({
                  message: 'Sync failed — check your connection.',
                  duration: 3000,
                  position: 'top',
                  color: 'danger',
                });
                await err.present();
              });
            }
          },
        },
      ],
    });
    await toast.present();
  }
  prevOnline = online;
});

// Start IDB preload immediately so items are ready before ScanningPage mounts
onMounted(() => { StorageService.init(); });
</script>
