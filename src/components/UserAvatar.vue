<template>
  <div class="ua-wrap">
    <img
      v-if="src && !imgFailed"
      :src="src"
      class="ua-img"
      :alt="initial"
      @error="imgFailed = true"
    />
    <span v-else>{{ initial }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{ src?: string | null; name?: string }>();

const imgFailed = ref(false);
watch(() => props.src, () => { imgFailed.value = false; });

const initial = computed(() => props.name?.trim()?.charAt(0)?.toUpperCase() ?? '?');
</script>

<style scoped>
/* ua-wrap fills whatever size + shape the parent class provides */
.ua-wrap {
  overflow: hidden;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ua-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  flex-shrink: 0;
}
</style>
