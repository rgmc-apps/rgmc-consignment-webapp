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

const { isOnline } = useNetworkStatus();
const { triggerHeaderPulse } = useGoldAccent();

let prevOnline = isOnline.value;
watch(isOnline, async (online) => {
  if (prevOnline && !online) {
    const toast = await toastController.create({
      message: `
        <div class="offline-toast-body">
          <strong>You're now offline</strong>
          <span>The app will continue in offline mode. Submitting orders requires a connection.</span>
        </div>
      `,
      duration: 4500,
      position: 'top',
      cssClass: 'offline-toast',
      color: 'dark',
    });
    await toast.present();
  } else if (!prevOnline && online) {
    triggerHeaderPulse();
  }
  prevOnline = online;
});

// Start IDB preload immediately so items are ready before ScanningPage mounts
onMounted(() => { StorageService.init(); });
</script>
