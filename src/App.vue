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

const { isOnline } = useNetworkStatus();
const { triggerHeaderPulse } = useGoldAccent();
const { sync, isSyncing } = useSync();

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
