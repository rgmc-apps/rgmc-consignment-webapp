<template>
  <div class="app-logo" :class="`app-logo--${size}`">
    <img :src="logoSrc" :alt="alt" class="app-logo__img" />
    <div v-if="showText" class="app-logo__text">
      <span class="app-logo__title">RGMC Consignment</span>
      <span class="app-logo__sub">Web App</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from '@/composables/useTheme';

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
    variant?: 'cons' | 'group';
  }>(),
  {
    size: 'md',
    showText: false,
    variant: 'cons',
  },
);

const { theme } = useTheme();
const alt = 'RGMC Consignment';

const logoSrc = computed(() => {
  if (theme.value === 'minimalist') return '/static/logo-bnw.png';
  return props.variant === 'group' ? '/static/logo.png' : '/static/cons-logo.png';
});
</script>

<style scoped>
.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-logo__img {
  object-fit: contain;
  flex-shrink: 0;
}

.app-logo--sm .app-logo__img {
  width: 36px;
  height: 36px;
}

.app-logo--md .app-logo__img {
  width: 52px;
  height: 52px;
}

.app-logo--lg .app-logo__img {
  width: 80px;
  height: 80px;
}

.app-logo__text {
  display: flex;
  flex-direction: column;
}

.app-logo__title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.3px;
  line-height: 1.2;
}

.app-logo__sub {
  font-size: 11px;
  color: var(--app-gold-light);
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
</style>
