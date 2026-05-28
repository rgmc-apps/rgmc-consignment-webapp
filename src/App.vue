<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { StorageService } from '@/services/storage.service';

// Start IDB preload immediately so items are ready before ScanningPage mounts
onMounted(() => { StorageService.init(); });
</script>
