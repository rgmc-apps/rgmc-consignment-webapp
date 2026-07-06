<template>
  <ion-modal :is-open="isVisible" @did-dismiss="onDismissed" class="welcome-modal">
    <ion-page class="wm-page" :class="{ 'wm-page--minimalist': isMinimalist }">

      <!-- Ambient background orb (shifts subtly per slide) -->
      <div class="wm-bg-orb" :class="`wm-bg-orb--${current}`" aria-hidden="true" />

      <!-- Progress bar -->
      <div class="wm-progress" role="progressbar" :aria-valuenow="progressPct">
        <div class="wm-progress-fill" :style="{ width: progressPct + '%' }" />
      </div>

      <!-- Skip button (all slides except last) -->
      <Transition name="wm-skip">
        <button v-if="current < slides.length - 1" class="wm-skip-btn" @click="finish">
          Skip
        </button>
      </Transition>

      <!-- Slide viewport -->
      <div class="wm-viewport" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <div class="wm-track" :style="{ transform: `translateX(-${current * 100}%)` }">

          <!-- Slide 0: Intro -->
          <div class="wm-slide wm-slide--intro">
            <div class="wm-intro-inner">
              <span class="wm-eyebrow">RGMC · Consignment</span>
              <div class="wm-intro-logo-wrap">
                <div class="wm-intro-logo-glow" aria-hidden="true" />
                <img :src="isMinimalist ? '/static/logo-bnw.png' : '/static/cons-logo-splash.png'" alt="RGMC Consignment" class="wm-intro-logo" />
              </div>
              <div class="wm-intro-text">
                <h1 class="wm-intro-heading">
                  Welcome,<br />
                  <span class="wm-intro-name">{{ firstName }}</span>
                </h1>
                <p class="wm-intro-sub">{{ slides[0].desc }}</p>
              </div>
            </div>
          </div>

          <!-- Slides 1–4: Feature slides -->
          <div
            v-for="(slide, i) in slides.slice(1)"
            :key="i + 1"
            class="wm-slide wm-slide--feature"
          >
            <div class="wm-phone-wrap">
              <!-- Double-Bezel: outer aluminum shell -->
              <div class="wm-phone-outer">
                <!-- Double-Bezel: inner glass core -->
                <div class="wm-phone">
                  <div class="wm-phone-notch" />
                  <img :src="slide.img!" :alt="slide.title" class="wm-phone-screen" />
                </div>
              </div>
              <!-- Floating label tag — glass pill with nested icon -->
              <div class="wm-phone-tag" :class="`wm-phone-tag--${i + 1}`">
                <span class="wm-phone-tag-icon">
                  <ion-icon :icon="slide.icon" />
                </span>
                {{ slide.label }}
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Bottom panel -->
      <div class="wm-panel">

        <!-- Step badge -->
        <div class="wm-step-row">
          <Transition name="wm-chip">
            <span v-if="current > 0" class="wm-step-chip">
              Step {{ current }}&thinsp;/&thinsp;{{ slides.length - 1 }}
            </span>
          </Transition>
        </div>

        <!-- Title + description — animates out-in on each slide change -->
        <Transition name="wm-text" mode="out-in">
          <div v-if="current > 0" :key="current" class="wm-panel-text">
            <h2 class="wm-panel-title">{{ slides[current].title }}</h2>
            <p class="wm-panel-desc">{{ slides[current].desc }}</p>
          </div>
          <div v-else key="placeholder" class="wm-panel-placeholder" />
        </Transition>

        <!-- Nav row: prev | dots | next -->
        <div class="wm-nav">
          <button
            class="wm-nav-btn"
            :disabled="current === 0"
            aria-label="Previous"
            @click="prev"
          >
            <span class="wm-nav-btn-inner">
              <ion-icon :icon="chevronBackOutline" />
            </span>
          </button>

          <div class="wm-dots" role="tablist">
            <button
              v-for="(_, i) in slides"
              :key="i"
              class="wm-dot"
              :class="{ 'wm-dot--active': i === current }"
              :aria-label="`Slide ${i + 1}`"
              @click="goTo(i)"
            />
          </div>

          <button
            class="wm-nav-btn"
            :class="{ 'wm-nav-btn--gold': current === slides.length - 1 }"
            :aria-label="current === slides.length - 1 ? 'Finish' : 'Next'"
            @click="current === slides.length - 1 ? finish() : next()"
          >
            <span class="wm-nav-btn-inner">
              <ion-icon :icon="current === slides.length - 1 ? checkmarkOutline : chevronForwardOutline" />
            </span>
          </button>
        </div>

        <!-- Get Started CTA — Button-in-Button pattern (last slide only) -->
        <Transition name="wm-cta">
          <button
            v-if="current === slides.length - 1"
            class="wm-cta-btn"
            @click="finish"
          >
            <span class="wm-cta-label">Get Started</span>
            <span class="wm-cta-arrow">
              <ion-icon :icon="arrowForwardOutline" />
            </span>
          </button>
        </Transition>

      </div>

    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { IonModal, IonPage, IonIcon } from '@ionic/vue';
import {
  chevronBackOutline,
  chevronForwardOutline,
  checkmarkOutline,
  arrowForwardOutline,
  homeOutline,
  scanOutline,
  timeOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme } from '@/composables/useTheme';

const landingImg  = '/static/screenshots/03-landing.png';
const scanImg     = '/static/screenshots/04-scanning-form.png';
const historyImg  = '/static/screenshots/06-history.png';
const submitImg   = '/static/screenshots/08-submit.png';

const props = defineProps<{ isOpen: boolean }>();
const emit  = defineEmits<{ done: [] }>();

const isVisible = ref(props.isOpen);
const authStore = useAuthStore();
const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');

const firstName = computed(() => {
  const name = authStore.user?.displayName ?? '';
  return name.split(' ')[0] || 'there';
});

const slides = [
  {
    title: '',
    desc: "Here's a quick tour of what you can do in the RGMC Consignment app.",
    img: null,
    icon: null,
    label: '',
  },
  {
    title: 'Home Dashboard',
    desc: 'Tap "New Session" to start, or pick up a saved draft right where you left off.',
    img: landingImg,
    icon: homeOutline,
    label: 'Home',
  },
  {
    title: 'Scan & Record',
    desc: 'Choose a customer, browse by category, then scan or search items to log sales and returns.',
    img: scanImg,
    icon: scanOutline,
    label: 'Scan',
  },
  {
    title: 'Order History',
    desc: 'See every submitted order in one place — filter by status or tap an entry for details.',
    img: historyImg,
    icon: timeOutline,
    label: 'History',
  },
  {
    title: 'Review & Submit',
    desc: 'Double-check each line item, then submit directly to Business Central when you\'re ready.',
    img: submitImg,
    icon: cloudUploadOutline,
    label: 'Submit',
  },
] as const;

const current     = ref(0);
const progressPct = computed(() => ((current.value + 1) / slides.length) * 100);

// ── Auto-advance timer ──────────────────────────────────────────────────────
const SLIDE_MS = 5_000;
let timer: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  stopTimer();
  if (current.value < slides.length - 1) {
    timer = setInterval(() => {
      if (current.value < slides.length - 1) current.value++;
      else stopTimer();
    }, SLIDE_MS);
  }
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function next()          { if (current.value < slides.length - 1) current.value++; startTimer(); }
function prev()          { if (current.value > 0) current.value--; startTimer(); }
function goTo(i: number) { current.value = i; startTimer(); }
function finish()        { stopTimer(); isVisible.value = false; }
function onDismissed()   { emit('done'); }

let touchStartX = 0;

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX;
  stopTimer();
}

function onTouchEnd(e: TouchEvent) {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 50) {
    if (delta < 0) next();
    else prev();
  } else {
    startTimer();
  }
}

watch(() => props.isOpen, (open) => {
  isVisible.value = open;
  if (open) { current.value = 0; startTimer(); }
  else stopTimer();
});

onMounted(() => { if (props.isOpen) startTimer(); });
onUnmounted(() => stopTimer());
</script>

<style scoped>
/* ── Modal shell ─────────────────────────────────────────────────────────── */
.wm-page {
  --background: #07070a;
  background: #07070a;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ── Ambient background orb ──────────────────────────────────────────────── */
/*
 * A radial gold gradient layer behind everything.
 * On the intro slide it blooms from the upper-right;
 * on feature slides it sits as a soft crown at the top.
 */
.wm-bg-orb {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  transition: opacity 1s cubic-bezier(0.32, 0.72, 0, 1);
}

.wm-bg-orb--0 {
  background:
    radial-gradient(ellipse 80% 55% at 58% 18%, rgba(160, 115, 32, 0.16) 0%, transparent 65%),
    radial-gradient(ellipse 45% 32% at 12% 78%, rgba(160, 115, 32, 0.07) 0%, transparent 60%);
}

.wm-bg-orb--1,
.wm-bg-orb--2,
.wm-bg-orb--3,
.wm-bg-orb--4 {
  background: radial-gradient(ellipse 90% 50% at 50% -5%, rgba(160, 115, 32, 0.13) 0%, transparent 58%);
}

/* ── Progress bar ────────────────────────────────────────────────────────── */
.wm-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  overflow: hidden;
}

.wm-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #7a5418, #c4972e 50%, #e8c060);
  transition: width 0.5s cubic-bezier(0.32, 0.72, 0, 1);
  position: relative;
}

/* Shimmer sweep — light traveling across the filled bar */
.wm-progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.38), transparent);
  animation: wm-shimmer 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* ── Skip button ─────────────────────────────────────────────────────────── */
.wm-skip-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 20;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.25s cubic-bezier(0.32, 0.72, 0, 1), color 0.25s;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  -webkit-appearance: none;
  appearance: none;
  outline: none;
}

.wm-skip-btn:hover  { background: rgba(255, 255, 255, 0.1);  color: rgba(255, 255, 255, 0.65); }
.wm-skip-btn:active { background: rgba(255, 255, 255, 0.07); }

.wm-skip-enter-active, .wm-skip-leave-active { transition: opacity 0.2s ease; }
.wm-skip-enter-from,   .wm-skip-leave-to     { opacity: 0; }

/* ── Slide viewport ──────────────────────────────────────────────────────── */
.wm-viewport {
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 2;
  min-height: 0;
}

.wm-track {
  display: flex;
  height: 100%;
  transition: transform 0.42s cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

/* ── Individual slides ───────────────────────────────────────────────────── */
.wm-slide {
  min-width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 20px 6px;
  box-sizing: border-box;
  position: relative;
  z-index: 2;
}

/* ── Intro slide ─────────────────────────────────────────────────────────── */
.wm-slide--intro {
  flex-direction: column;
  gap: 0;
}

.wm-intro-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  max-width: min(320px, 92vw);
  text-align: center;
}

/* Eyebrow pill — announces the product before the heading */
.wm-eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 14px;
  background: rgba(160, 115, 32, 0.1);
  border: 1px solid rgba(160, 115, 32, 0.22);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(196, 151, 46, 0.85);
  animation: wm-fade-up 0.5s cubic-bezier(0.32, 0.72, 0, 1) 0.05s both;
}

/* Logo wrapper — needed to layer the glow behind the image */
.wm-intro-logo-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: wm-logo-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
}

/* Radial gold corona that pulses gently behind the logo */
.wm-intro-logo-glow {
  position: absolute;
  inset: -30%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(160, 115, 32, 0.32) 0%, transparent 68%);
  animation: wm-glow-pulse 3.5s ease-in-out infinite;
}

.wm-intro-logo {
  width: clamp(155px, 42vw, 228px);
  height: clamp(155px, 42vw, 228px);
  object-fit: contain;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 6px 20px rgba(160, 115, 32, 0.22));
}

.wm-intro-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: wm-fade-up 0.5s cubic-bezier(0.32, 0.72, 0, 1) 0.28s both;
}

.wm-intro-heading {
  font-size: clamp(28px, 7.5vw, 38px);
  font-weight: 800;
  color: #fff;
  line-height: 1.12;
  margin: 0;
  letter-spacing: -0.8px;
}

/* Gold gradient clipped to the first-name text */
.wm-intro-name {
  background: linear-gradient(135deg, #e8c060 0%, #b8881e 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.wm-intro-sub {
  font-size: clamp(13px, 3.5vw, 15px);
  color: rgba(255, 255, 255, 0.46);
  line-height: 1.65;
  margin: 0;
}

/* ── Feature slides ──────────────────────────────────────────────────────── */
/* Minimal top padding so the phone fills as much height as possible */
.wm-slide--feature { padding-top: 16px; }

.wm-phone-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/*
 * Double-Bezel outer shell — the "aluminum tray" surrounding the phone.
 *
 * Height formula:  total viewport - panel height (~220px) - progress bar (4px)
 *                  - slide top padding (16px) = viewport - 240px
 * Clamped so it never collapses below 290px (landscape) or exceeds 615px (tablet).
 *
 * Width derives automatically from the aspect ratio so the phone always stays
 * proportional regardless of screen size.
 */
.wm-phone-outer {
  --phone-r:   clamp(22px, 4dvh, 42px);
  --phone-pad: 3px;

  height: clamp(290px, calc(100dvh - 240px), 615px);
  width: auto;
  aspect-ratio: 178 / 324;

  border-radius: var(--phone-r);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: var(--phone-pad);

  box-shadow:
    0 50px 100px rgba(0, 0, 0, 0.85),
    0 16px 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);

  animation: wm-phone-enter 0.55s cubic-bezier(0.34, 1.3, 0.64, 1) both;
}

/*
 * Double-Bezel inner core — the actual glass face of the phone.
 *
 * Border-radius is the outer radius minus padding minus border (≈4px total)
 * so the two arcs are concentric — they look like nested hardware layers.
 */
.wm-phone {
  width: 100%;
  height: 100%;
  border-radius: calc(var(--phone-r) - var(--phone-pad) - 1px);
  background: #000;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
}

.wm-phone-notch {
  position: absolute;
  top: clamp(7px, 1.2dvh, 12px);
  left: 50%;
  transform: translateX(-50%);
  width: 32%;
  height: clamp(5px, 0.9dvh, 9px);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.12);
  z-index: 2;
}

.wm-phone-screen {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

/*
 * Floating tag — dark glass pill that names the feature being shown.
 * Contains a nested icon circle (Double-Bezel concept at micro scale).
 */
.wm-phone-tag {
  position: absolute;
  bottom: clamp(-16px, -2dvh, -10px);
  right: clamp(-22px, -3.5vw, -14px);
  background: rgba(10, 8, 2, 0.88);
  border: 1px solid rgba(160, 115, 32, 0.4);
  border-radius: 24px;
  color: #e0b84e;
  font-size: clamp(11px, 2.8vw, 13px);
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 5px 12px 5px 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(160, 115, 32, 0.12);
  white-space: nowrap;
}

/* Nested icon circle inside the tag */
.wm-phone-tag-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(160, 115, 32, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #c4972e;
  flex-shrink: 0;
}

/* ── Bottom panel ────────────────────────────────────────────────────────── */
.wm-panel {
  flex-shrink: 0;
  padding: 14px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #07070a;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  position: relative;
  z-index: 10;
}

/* ── Step badge ──────────────────────────────────────────────────────────── */
.wm-step-row { min-height: 22px; }

.wm-step-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(160, 115, 32, 0.1);
  border: 1px solid rgba(160, 115, 32, 0.24);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(196, 151, 46, 0.9);
}

.wm-chip-enter-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.wm-chip-leave-active { transition: opacity 0.15s ease; }
.wm-chip-enter-from   { opacity: 0; transform: translateY(-4px); }
.wm-chip-leave-to     { opacity: 0; }

/* ── Panel text ──────────────────────────────────────────────────────────── */
/* min-height keeps the panel a stable height so the nav row doesn't jump */
.wm-panel-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 72px;
}

.wm-panel-placeholder {
  min-height: 72px;
}

.wm-panel-title {
  font-size: clamp(20px, 5vw, 24px);
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.4px;
}

.wm-panel-desc {
  font-size: clamp(13px, 3.2vw, 14px);
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.65;
  margin: 0;
}

/* Text slides up in and down out between feature slides */
.wm-text-enter-active {
  transition: opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.wm-text-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.wm-text-enter-from { opacity: 0; transform: translateY(8px);  }
.wm-text-leave-to   { opacity: 0; transform: translateY(-5px); }

/* ── Nav row ─────────────────────────────────────────────────────────────── */
.wm-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

/*
 * Double-Bezel nav button — outer ring acts as the shell,
 * the inner span holds the icon and provides its own background.
 */
.wm-nav-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
}

.wm-nav-btn-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 17px;
  transition: inherit;
}

.wm-nav-btn:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.18); }
.wm-nav-btn:hover:not(:disabled) .wm-nav-btn-inner {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.wm-nav-btn:active:not(:disabled) { transform: scale(0.93); }
.wm-nav-btn:disabled              { opacity: 0.18; cursor: default; }

/* Gold variant for the final-slide next button */
.wm-nav-btn--gold {
  border-color: rgba(160, 115, 32, 0.35);
  background: rgba(160, 115, 32, 0.04);
}
.wm-nav-btn--gold .wm-nav-btn-inner {
  background: rgba(160, 115, 32, 0.15);
  color: #c4972e;
  box-shadow: inset 0 1px 0 rgba(196, 151, 46, 0.2);
}
.wm-nav-btn--gold:hover .wm-nav-btn-inner {
  background: rgba(160, 115, 32, 0.25);
}

/* ── Dots ────────────────────────────────────────────────────────────────── */
.wm-dots {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.wm-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.16);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: width 0.3s cubic-bezier(0.32, 0.72, 0, 1), background 0.3s;
  outline: none;
}
.wm-dot--active { width: 20px; background: #a07320; }

/* ── CTA button — Button-in-Button pattern ───────────────────────────────── */
/*
 * The "Get Started" button is a full pill.
 * The arrow lives inside its own nested circle on the right end —
 * this "button within a button" creates internal kinetic tension on hover.
 */
.wm-cta-btn {
  width: 100%;
  height: 54px;
  border-radius: 27px;
  background: linear-gradient(135deg, #b88a22 0%, #a07320 100%);
  border: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 7px 0 22px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow:
    0 8px 28px rgba(160, 115, 32, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  margin-top: 4px;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
}

.wm-cta-btn:active {
  transform: scale(0.98);
  box-shadow: 0 4px 16px rgba(160, 115, 32, 0.3);
}

.wm-cta-label {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.1px;
  color: #fff;
}

/* Nested arrow circle — the inner "button" of the Button-in-Button */
.wm-cta-arrow {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  flex-shrink: 0;
}

.wm-cta-btn:hover .wm-cta-arrow {
  transform: translateX(3px) translateY(-1px) scale(1.06);
}

.wm-cta-enter-active {
  transition: opacity 0.32s cubic-bezier(0.32, 0.72, 0, 1), transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.wm-cta-leave-active { transition: opacity 0.15s ease; }
.wm-cta-enter-from   { opacity: 0; transform: translateY(10px); }
.wm-cta-leave-to     { opacity: 0; }

/* ── Keyframes ───────────────────────────────────────────────────────────── */
@keyframes wm-fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0);    }
}

@keyframes wm-logo-enter {
  from { opacity: 0; transform: scale(0.72) rotate(-8deg); }
  to   { opacity: 1; transform: scale(1)    rotate(0deg);  }
}

@keyframes wm-phone-enter {
  from { opacity: 0; transform: translateY(28px) scale(0.91); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}

/* Logo corona — slow breathe so it feels alive but not distracting */
@keyframes wm-glow-pulse {
  0%, 100% { opacity: 0.65; transform: scale(1);    }
  50%       { opacity: 1;    transform: scale(1.1); }
}

/* Progress shimmer — light traveling right across the filled bar */
@keyframes wm-shimmer {
  to { left: 200%; }
}
</style>

<!-- Force full-screen on all breakpoints -->
<style>
.welcome-modal {
  --height: 100%;
  --width: 100%;
  --max-height: 100%;
  --border-radius: 0;
}

/* ── Minimalist theme adaptations ── */
.wm-page--minimalist {
  --background: #f4f4f4;
  background: #f4f4f4;
}

.wm-page--minimalist .wm-progress {
  background: rgba(0, 0, 0, 0.07);
}

.wm-page--minimalist .wm-progress-fill {
  background: linear-gradient(90deg, #555, #777 50%, #555);
}

.wm-page--minimalist .wm-skip-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.45);
  box-shadow: none;
}

.wm-page--minimalist .wm-skip-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.65);
}

.wm-page--minimalist .wm-bg-orb { opacity: 0.25; }

.wm-page--minimalist .wm-eyebrow {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
  color: #555;
}

.wm-page--minimalist .wm-intro-logo-glow {
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.06) 0%, transparent 68%);
}

.wm-page--minimalist .wm-intro-logo {
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.12));
}

.wm-page--minimalist .wm-intro-heading { color: #2a2a2a; }

.wm-page--minimalist .wm-intro-name {
  background: linear-gradient(135deg, #555 0%, #333 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.wm-page--minimalist .wm-intro-sub { color: rgba(0, 0, 0, 0.5); }

.wm-page--minimalist .wm-phone-outer {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.12),
    0 6px 18px rgba(0, 0, 0, 0.07);
}

.wm-page--minimalist .wm-phone {
  background: #e8e8e8;
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.06);
}

.wm-page--minimalist .wm-phone-notch { background: rgba(0, 0, 0, 0.1); }

.wm-page--minimalist .wm-phone-tag {
  background: rgba(248, 248, 248, 0.95);
  border-color: rgba(0, 0, 0, 0.12);
  color: #444;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.wm-page--minimalist .wm-phone-tag-icon {
  background: rgba(0, 0, 0, 0.06);
  color: #555;
}

.wm-page--minimalist .wm-panel {
  background: #f4f4f4;
  border-top-color: rgba(0, 0, 0, 0.08);
}

.wm-page--minimalist .wm-step-chip {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
  color: #555;
}

.wm-page--minimalist .wm-panel-title { color: #2a2a2a; }
.wm-page--minimalist .wm-panel-desc  { color: rgba(0, 0, 0, 0.5); }

.wm-page--minimalist .wm-nav-btn {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}

.wm-page--minimalist .wm-nav-btn-inner {
  background: rgba(0, 0, 0, 0.05);
  box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.45);
}

.wm-page--minimalist .wm-nav-btn:hover:not(:disabled) { border-color: rgba(0, 0, 0, 0.2); }
.wm-page--minimalist .wm-nav-btn:hover:not(:disabled) .wm-nav-btn-inner {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.wm-page--minimalist .wm-nav-btn--gold {
  border-color: rgba(0, 0, 0, 0.18);
  background: rgba(0, 0, 0, 0.03);
}

.wm-page--minimalist .wm-nav-btn--gold .wm-nav-btn-inner {
  background: rgba(0, 0, 0, 0.08);
  color: #333;
}

.wm-page--minimalist .wm-dot { background: rgba(0, 0, 0, 0.14); }
.wm-page--minimalist .wm-dot--active { background: #444; }

.wm-page--minimalist .wm-cta-btn {
  background: linear-gradient(135deg, #444 0%, #333 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.wm-page--minimalist .wm-cta-btn:active {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}
</style>
