<template>
  <ion-page :class="{ 'scanning--minimalist': isMinimalist }">
    <!-- ── Header ── -->
    <ion-header :class="{ 'gold-online-pulse': headerPulseActive }">
      <ion-toolbar>
        <ion-title>
          <div class="header-title">
            <img :src="headerLogoSrc" alt="logo" class="header-logo" />
            <div class="header-text">
              <span class="header-brand">{{ authStore.brand?.displayName ?? 'Scan' }}</span>
              <span v-if="authStore.company" class="header-company">{{ authStore.company.displayName }}</span>
            </div>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="selectedCustomer"
            fill="clear"
            color="medium"
            @click="saveDraftAndGoHome"
          >
            <ion-icon :icon="saveOutline" slot="icon-only" />
          </ion-button>
          <bug-report-button />
          <profile-menu />
        </ion-buttons>
      </ion-toolbar>

      <!-- Sync info sub-bar -->
      <ion-toolbar class="sync-bar">
        <div class="sync-bar-inner">
          <span class="sync-info-text">
            <ion-icon :icon="timeOutline" />
            {{ lastSyncLabel }}
          </span>
          <Transition name="net-notice-fade">
            <span v-if="!isOnline" class="offline-badge">
              <ion-icon :icon="cloudOfflineOutline" />
              OFFLINE
            </span>
            <span v-else class="sync-today">{{ todayLabel }} <span class="version-tag">v{{ appVersion }}</span></span>
          </Transition>
        </div>
      </ion-toolbar>
    </ion-header>

    <!-- ── Content ── -->
    <ion-content :scroll-events="true">

      <!-- Pull-to-refresh -->
      <ion-refresher slot="fixed" @ionRefresh="onPullRefresh($event)">
        <ion-refresher-content
          :pulling-icon="chevronDownCircleOutline"
          :pulling-text="isOnline ? 'Pull to sync' : 'Offline — nothing to sync'"
          refreshing-spinner="crescent"
          :refreshing-text="isOnline ? 'Syncing…' : 'Offline'"
        />
      </ion-refresher>

      <!-- Network notice -->
      <Transition name="net-notice-fade">
        <div v-if="networkNotice" :class="['net-notice', `net-notice--${networkNotice}`]">
          <ion-icon :icon="networkNotice === 'offline' ? cloudOfflineOutline : warningOutline" />
          <div class="net-notice-text">
            <span class="net-notice-main">{{
              networkNotice === 'offline'
                ? (hasCache ? 'Offline Mode' : 'No Connection')
                : 'Connection seems slow'
            }}</span>
            <span class="net-notice-sub">{{
              networkNotice === 'offline'
                ? (hasCache
                    ? 'Scanning available — reconnect to sync or submit orders.'
                    : 'Connect to a network to load items before scanning.')
                : 'Sync may take longer than usual.'
            }}</span>
          </div>
        </div>
      </Transition>

      <!-- No cache state -->
      <div v-if="!canScan && !isSyncing" class="state-card">
        <!-- Offline with no items — cannot scan -->
        <template v-if="!isOnline">
          <ion-icon :icon="cloudOfflineOutline" color="warning" />
          <p>Offline — no data loaded</p>
          <p class="state-sub">
            Connect to a network to sync items and customers before scanning.
          </p>
        </template>
        <!-- Synced but API returned 0 items -->
        <template v-else-if="lastSyncDate && cachedItems.length === 0">
          <ion-icon :icon="alertCircleOutline" color="warning" />
          <p>No items found</p>
          <p class="state-sub">
            Sync completed but the server returned no items.
            Contact your administrator if this persists.
          </p>
        </template>
        <!-- Server catalog is empty — offer a trigger -->
        <template v-else-if="isCatalogEmpty">
          <ion-icon :icon="cloudDownloadOutline" color="warning" />
          <p>Server catalog not ready</p>
          <p class="state-sub">
            The item price catalog hasn't been loaded on the server for
            <strong>{{ authStore.company?.displayName ?? 'this company' }}</strong>
            yet. Trigger a server sync below, wait 2–3 minutes, then tap Sync Now.
          </p>
        </template>
        <!-- Never synced (or sync failed before storing anything) -->
        <template v-else>
          <ion-icon :icon="cloudDownloadOutline" color="medium" />
          <p>Data not loaded yet.</p>
          <p class="state-sub">Tap Sync to download customers and items before scanning.</p>
        </template>
        <ion-button v-if="isOnline" @click="sync">
          <ion-icon :icon="syncOutline" slot="start" />
          {{ lastSyncDate && cachedItems.length === 0 ? 'Retry Sync' : 'Sync Now' }}
        </ion-button>
        <!-- Trigger server sync when catalog is empty -->
        <template v-if="isCatalogEmpty && isOnline">
          <ion-button
            fill="outline"
            color="warning"
            :disabled="isTriggering"
            @click="doTriggerRemoteSync"
          >
            <ion-spinner v-if="isTriggering" name="dots" slot="start" style="width:16px;height:16px" />
            <ion-icon v-else :icon="cloudDownloadOutline" slot="start" />
            {{ isTriggering ? 'Triggering…' : 'Trigger Server Sync' }}
          </ion-button>
          <p v-if="triggerMessage" class="trigger-msg" :class="{ 'trigger-msg--error': triggerMessage.startsWith('Failed') }">
            {{ triggerMessage }}
          </p>
        </template>
      </div>

      <!-- Sync warning banner (catalog empty with cached data, or partial sync failure) -->
      <Transition name="net-notice-fade">
        <div v-if="syncWarning && !isSyncing" class="sync-warn-banner">
          <ion-icon :icon="alertCircleOutline" color="warning" />
          <div class="sync-warn-content">
            <span>{{ syncWarning }}</span>
            <template v-if="isCatalogEmpty && isOnline">
              <ion-button
                size="small"
                fill="outline"
                color="warning"
                :disabled="isTriggering"
                class="sync-warn-trigger"
                @click="doTriggerRemoteSync"
              >
                <ion-spinner v-if="isTriggering" name="dots" slot="start" style="width:12px;height:12px" />
                {{ isTriggering ? 'Triggering…' : 'Trigger Server Sync' }}
              </ion-button>
              <span v-if="triggerMessage" class="trigger-msg" :class="{ 'trigger-msg--error': triggerMessage.startsWith('Failed') }">
                {{ triggerMessage }}
              </span>
            </template>
          </div>
        </div>
      </Transition>

      <!-- Syncing skeleton — mirrors the form layout so the user sees what's loading -->
      <div v-if="isSyncing" class="scan-skeleton">
        <!-- Skeleton: Customer card -->
        <div class="skel-form-card">
          <div class="skel-eyebrow skel-bone" />
          <div class="skel-cust-block">
            <div class="skel-cust-name skel-bone" />
            <div class="skel-cust-sub skel-bone" />
          </div>
          <div class="skel-divider" />
          <div class="skel-date-block">
            <div class="skel-date-label skel-bone" />
            <div class="skel-date-value skel-bone" />
          </div>
        </div>
        <!-- Skeleton: Item form card -->
        <div class="skel-form-card skel-form-card--delay">
          <div class="skel-eyebrow skel-bone" />
          <div v-for="n in 3" :key="n" class="skel-field-row">
            <div class="skel-field-label skel-bone" />
            <div class="skel-field-value skel-bone" />
          </div>
        </div>
        <!-- Sync status message at the bottom -->
        <div class="skel-sync-status">
          <ion-spinner name="dots" class="skel-sync-spinner" />
          <div class="skel-sync-text">
            <span :key="syncMainMsg" class="skel-sync-main cycling-text">{{ syncMainMsg }}</span>
            <span :key="syncSubMsg" class="skel-sync-sub cycling-text">{{ syncSubMsg }}</span>
          </div>
        </div>
      </div>

      <!-- Sync error -->
      <div v-if="syncError" class="sync-err-banner">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <span>{{ syncError }}</span>
      </div>

      <template v-if="canScan">

        <!-- Price list update / expiry notice -->
        <Transition name="net-notice-fade">
          <div v-if="hasPriceListAlerts && !isSyncing && isOnline" class="price-list-alert-banner">
            <div
              v-for="alert in priceListAlerts"
              :key="alert.type"
              :class="['price-list-alert-row', `price-list-alert-row--${alert.type}`]"
            >
              <ion-icon
                :icon="alert.type === 'expired' ? warningOutline : refreshCircleOutline"
                :color="alert.type === 'expired' ? 'warning' : 'primary'"
              />
              <span>{{ alert.message }}</span>
            </div>
            <div class="price-list-alert-actions">
              <ion-button size="small" fill="outline" color="primary" @click="sync">
                <ion-icon :icon="syncOutline" slot="start" />
                Sync Now
              </ion-button>
              <ion-button size="small" fill="clear" color="medium" @click="dismissPriceListAlert">
                Dismiss
              </ion-button>
            </div>
          </div>
        </Transition>

        <div class="scan-panels">
        <div class="scan-form-col">
        <!-- ══ Customer Card ══ -->
        <ion-card class="form-card">
          <ion-card-content>
            <p class="field-label">CUSTOMER</p>
            <div :class="['customer-tap', { 'customer-tap--flash': customerFlash }]" @click="showCustomerModal = true">
              <div v-if="selectedCustomer" class="customer-info">
                <p class="cust-name">{{ selectedCustomer.displayName }}</p>
                <p class="cust-sub">{{ selectedCustomer.number }} &bull; {{ selectedCustomer.city }}</p>
              </div>
              <p v-else class="cust-placeholder">Tap to select customer…</p>
              <ion-icon :icon="chevronDownOutline" color="medium" />
            </div>

            <!-- Order date -->
            <div class="order-date-section">
              <p class="field-label">POSTING DATE</p>
              <div class="order-date-row">
                <ion-icon :icon="calendarOutline" color="medium" class="order-date-icon" />
                <input
                  type="date"
                  :value="orderDateValue"
                  @change="(e) => { orderDateValue = (e.target as HTMLInputElement).value }"
                  class="order-date-input"
                />
              </div>
            </div>

            <!-- No Sales toggle -->
            <div class="no-sales-row">
              <div class="no-sales-label-group">
                <span class="no-sales-label">No Sales</span>
                <span class="no-sales-hint">Submit a sales order without items</span>
              </div>
              <ion-toggle
                :checked="sessionStore.currentSession?.noSales ?? false"
                @ionChange="sessionStore.setNoSales(($event as CustomEvent).detail.checked)"
                color="warning"
                class="no-sales-toggle"
              />
            </div>
          </ion-card-content>
        </ion-card>

        <!-- ══ Item Form Card ══ -->
        <ion-card class="form-card">
          <ion-card-content class="item-form-body">
            <p class="field-label">ADD ITEM</p>

            <!-- Item Category -->
            <ion-item lines="inset" class="form-row">
              <ion-label>Category</ion-label>
              <ion-select
                v-model="form.categoryCode"
                placeholder="All categories"
                interface="popover"
                class="form-select"
              >
                <ion-select-option value="">All categories</ion-select-option>
                <ion-select-option
                  v-for="cat in categories"
                  :key="cat.code"
                  :value="cat.code"
                >{{ cat.displayName }}</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Item selector trigger -->
            <ion-item lines="inset" button :detail="false" class="form-row" @click="showItemModal = true">
              <ion-label>Item</ion-label>
              <div slot="end" class="item-trigger-end">
                <span v-if="form.itemName" class="item-trigger-name">{{ form.itemName }}</span>
                <span v-else class="item-trigger-placeholder">Select or scan</span>
                <ion-icon :icon="barcodeOutline" color="primary" />
              </div>
            </ion-item>

            <!-- Fields below only visible once item is selected -->
            <Transition name="form-fields">
            <div v-if="form.itemNumber" class="form-fields-group">
              <!-- Description -->
              <ion-item lines="inset" class="form-row form-row--readonly">
                <ion-label>Description</ion-label>
                <ion-note slot="end" class="readonly-val">{{ form.description || '—' }}</ion-note>
              </ion-item>

              <!-- SRP -->
              <ion-item lines="inset" class="form-row form-row--readonly">
                <ion-label>SRP</ion-label>
                <ion-note slot="end" class="readonly-val readonly-val--gold">
                  <ion-spinner v-if="fetchingPrice" name="dots" style="width:16px;height:16px;vertical-align:middle" />
                  <template v-else>
                    {{ formatCurrency(form.srp) }}
                    <span v-if="form.priceListCode" class="price-list-code">{{ form.priceListCode }}</span>
                  </template>
                </ion-note>
              </ion-item>
              <p class="srp-date-hint">
                <ion-icon :icon="informationCircleOutline" />
                Price reflects the posting date above. Changing the date updates all prices.
              </p>

              <!-- Quantity -->
              <ion-item lines="inset" class="form-row">
                <ion-label>Quantity</ion-label>
                <ion-input
                  v-model.number="form.quantity"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  slot="end"
                  class="num-input"
                />
              </ion-item>

              <!-- Discount type + value (same row) -->
              <ion-item lines="inset" class="form-row">
                <ion-label>Discount</ion-label>
                <ion-select
                  v-model="form.discountType"
                  interface="popover"
                  slot="end"
                  class="disc-type-select"
                >
                  <ion-select-option value="percent">%</ion-select-option>
                  <ion-select-option value="amount">₱ Amt</ion-select-option>
                </ion-select>
                <ion-input
                  v-model.number="form.discountValue"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  placeholder="0"
                  slot="end"
                  class="num-input"
                />
              </ion-item>

              <!-- Total amount -->
              <ion-item lines="none" class="form-row total-row">
                <ion-label><strong>Total Amount</strong></ion-label>
                <ion-note slot="end" class="total-val">
                  {{ formatCurrency(totalAmount) }}
                </ion-note>
              </ion-item>

              <!-- Action buttons -->
              <div v-if="selectedCustomer" class="action-btns">
                <ion-button expand="block" color="primary" @click="addToSales">
                  <ion-icon :icon="addCircleOutline" slot="start" />
                  Add to Sales
                </ion-button>
                <ion-button expand="block" fill="outline" color="danger" @click="addToReturn">
                  <ion-icon :icon="returnDownBackOutline" slot="start" />
                  Add to Return
                </ion-button>
              </div>

              <div v-else class="no-cust-notice">
                <ion-icon :icon="alertCircleOutline" color="warning" />
                <p>Select a customer above to add items.</p>
              </div>
            </div>
            </Transition>
          </ion-card-content>
        </ion-card>

        </div><!-- /scan-form-col -->
        <div class="scan-list-col">
        <!-- ══ Order Lists ══ -->
        <template v-if="sessionStore.hasLines">
          <!-- Price-refresh indicator — shown while date-change price lookups are in flight -->
          <Transition name="net-notice-fade">
            <div v-if="isUpdatingLinePrices" class="price-refresh-banner">
              <ion-spinner name="dots" class="price-refresh-spinner" />
              <span>Updating prices for {{ orderDateValue }}…</span>
            </div>
          </Transition>

          <ion-segment v-model="activeTab" class="order-segment">
            <ion-segment-button value="sales">
              <ion-label>
                Sales
                <ion-badge v-if="sessionStore.salesOrders.length" color="primary" class="tab-bdg">
                  {{ sessionStore.salesOrders.length }}
                </ion-badge>
              </ion-label>
            </ion-segment-button>
            <ion-segment-button value="returns">
              <ion-label>
                Returns
                <ion-badge v-if="sessionStore.returnOrders.length" color="danger" class="tab-bdg">
                  {{ sessionStore.returnOrders.length }}
                </ion-badge>
              </ion-label>
            </ion-segment-button>
          </ion-segment>

          <ion-list class="order-list" lines="full">
            <TransitionGroup name="order-item">
            <ion-item-sliding
              v-for="line in activeOrders"
              :key="line.id"
            >
              <ion-item>
                <ion-label>
                  <h3>{{ line.itemName }}</h3>
                  <p>
                    {{ line.itemNumber }} &bull;
                    Qty {{ line.quantity }} &times;
                    <span :class="{ 'price-stale': isUpdatingLinePrices }">{{ formatCurrency(line.srp) }}</span>
                    <span v-if="line.priceListCode" class="price-list-code">{{ line.priceListCode }}</span>
                  </p>
                  <p>
                    Disc: {{ formatDiscount(line.discountType, line.discountValue) }}
                    &bull; Total: <span :class="{ 'price-stale': isUpdatingLinePrices }">{{ formatCurrency(line.totalAmount) }}</span>
                  </p>
                </ion-label>
                <ion-note
                  slot="end"
                  :color="activeTab === 'sales' ? 'primary' : 'danger'"
                  class="line-total"
                >
                  <ion-spinner v-if="isUpdatingLinePrices" name="dots" class="line-price-spinner" />
                  <template v-else>{{ formatCurrency(line.totalAmount) }}</template>
                </ion-note>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="danger" @click="deleteActiveLine(line.id)">
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
            </TransitionGroup>

            <!-- Subtotal row -->
            <ion-item lines="none" class="subtotal-row">
              <ion-label>
                <strong>
                  {{ activeOrders.length }}
                  {{ activeOrders.length === 1 ? 'item' : 'items' }}
                </strong>
              </ion-label>
              <ion-note slot="end" class="subtotal-val">
                {{ formatCurrency(activeTab === 'sales' ? sessionStore.salesTotal : sessionStore.returnTotal) }}
              </ion-note>
            </ion-item>
          </ion-list>

          <!-- Bottom spacer so submit bar doesn't cover last item -->
          <div style="height: 80px;" />
        </template>

        <div v-else class="empty-orders">
          <ion-icon :icon="cartOutline" color="medium" />
          <p>No items added yet.<br />Select an item and tap Add to Sales or Add to Return.</p>
        </div>
        </div><!-- /scan-list-col -->
        </div><!-- /scan-panels -->
      </template>
    </ion-content>

    <!-- ── Sticky submit bar ── -->
    <Transition name="submit-bar">
    <div v-if="sessionStore.hasLines || (sessionStore.currentSession?.noSales && sessionStore.currentSession?.customer)" :class="['submit-bar', { 'gold-item-flash': submitFlashActive }]">
      <div class="submit-bar__left">
        <span class="submit-bar__count">
          {{ sessionStore.salesOrders.length + sessionStore.returnOrders.length }} items
        </span>
        <span class="submit-bar__amount">{{ formatCurrency(sessionStore.salesTotal + sessionStore.returnTotal) }}</span>
      </div>
      <ion-button class="submit-bar__btn" router-link="/app/submit">
        Review &amp; Submit
        <ion-icon :icon="arrowForwardOutline" slot="end" />
      </ion-button>
    </div>
    </Transition>

    <!-- ══════════ Customer Modal ══════════ -->
    <ion-modal :is-open="showCustomerModal" @did-dismiss="showCustomerModal = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>
              <span>Select Customer</span>
              <span v-if="authStore.brand" class="modal-brand-tag">{{ authStore.brand.displayName }}</span>
            </ion-title>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="showCustomerModal = false">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-toolbar>
            <ion-searchbar
              v-model="customerSearch"
              :placeholder="`Search ${authStore.brand?.displayName ?? ''} customers…`"
              :debounce="200"
              :show-clear-button="'focus'"
            />
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list v-if="filteredCustomers.length" lines="full">
            <ion-item
              v-for="c in filteredCustomers"
              :key="c.id"
              button
              :detail="false"
              @click="selectCustomer(c)"
            >
              <ion-icon :icon="storefrontOutline" slot="start" color="medium" />
              <ion-label>
                <h3>{{ c.displayName }}</h3>
                <p>{{ c.number }} &bull; {{ c.city }}</p>
              </ion-label>
              <ion-icon
                v-if="selectedCustomer?.id === c.id"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
          </ion-list>
          <div v-else class="modal-empty">
            <p v-if="customerSearch">No customers found for "<strong>{{ customerSearch }}</strong>"</p>
            <p v-else>No customers loaded for <strong>{{ authStore.brand?.displayName }}</strong>.<br />Try syncing from the toolbar.</p>
          </div>
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- ══════════ Item Selector Modal ══════════ -->
    <item-selector-modal
      v-if="showItemModal"
      :items="cachedItems"
      :categories="categories"
      :initial-category-code="form.categoryCode"
      :is-online="isOnline"
      :on-date="orderDateValue"
      :family-code="authStore.brand?.code"
      @select="onItemSelected"
      @close="onItemModalClose"
    />

    <!-- ══════════ Confirm Add Sheet ══════════ -->
    <ion-modal
      :is-open="showConfirmModal"
      @did-dismiss="cancelConfirm"
      :breakpoints="[0, 0.92]"
      :initial-breakpoint="0.92"
      :handle="true"
    >
      <ion-content class="ion-padding conf-content">
        <template v-if="confirmItem">
          <!-- Item info -->
          <div class="conf-item-info">
            <p class="conf-item-name">{{ confirmItem.displayName }}</p>
            <div class="conf-item-meta">
              <span class="conf-item-num">{{ confirmItem.number }}</span>
              <span v-if="confirmItem.itemCategoryCode" class="conf-item-cat">
                · {{ confirmItem.itemCategoryCode }}
              </span>
            </div>
            <p class="conf-item-srp">
              <Transition name="price-reveal" mode="out-in">
                <span v-if="fetchingPrice" key="loading" class="conf-srp-loading">
                  <ion-spinner name="dots" class="srp-spinner" />
                  <span class="conf-srp-label">Fetching price…</span>
                </span>
                <span v-else :key="priceRevealKey" class="conf-srp-value">
                  {{ formatCurrency(confirmedSrp) }} <span class="conf-srp-label">SRP</span>
                  <span v-if="confirmedPriceListCode" class="price-list-code">{{ confirmedPriceListCode }}</span>
                </span>
              </Transition>
            </p>
          </div>

          <!-- No customer warning -->
          <div v-if="!selectedCustomer" class="conf-warn">
            <ion-icon :icon="alertCircleOutline" color="warning" />
            <span>Select a customer first before adding items.</span>
          </div>

          <!-- Quantity stepper -->
          <div class="conf-field-wrap">
            <p class="conf-field-label">Quantity</p>
            <div class="conf-qty-row">
              <ion-button
                fill="outline"
                color="medium"
                class="conf-qty-btn"
                @click="confirmQty = Math.max(1, (confirmQty || 1) - 1)"
              >
                <ion-icon :icon="removeOutline" slot="icon-only" />
              </ion-button>
              <ion-input
                v-model.number="confirmQty"
                type="number"
                inputmode="numeric"
                min="1"
                class="conf-qty-input"
              />
              <ion-button
                fill="outline"
                color="medium"
                class="conf-qty-btn"
                @click="confirmQty = (confirmQty || 1) + 1"
              >
                <ion-icon :icon="addOutline" slot="icon-only" />
              </ion-button>
            </div>
          </div>

          <!-- Discount -->
          <div class="conf-field-wrap">
            <p class="conf-field-label">Discount</p>
            <div class="conf-discount-row">
              <ion-segment
                v-model="confirmDiscountType"
                class="conf-disc-seg"
              >
                <ion-segment-button value="percent">
                  <ion-label>%</ion-label>
                </ion-segment-button>
                <ion-segment-button value="amount">
                  <ion-label>₱ Amt</ion-label>
                </ion-segment-button>
              </ion-segment>
              <ion-input
                v-model.number="confirmDiscountValue"
                type="number"
                inputmode="decimal"
                min="0"
                placeholder="0"
                class="conf-disc-input"
              />
            </div>
          </div>

          <!-- Grand total -->
          <div class="conf-total-row">
            <span class="conf-total-label">Grand Total</span>
            <span class="conf-total-value">{{ formatCurrency(confirmTotal) }}</span>
          </div>

          <!-- Action buttons -->
          <ion-button
            expand="block"
            color="primary"
            :disabled="!selectedCustomer"
            class="conf-btn"
            @click="doConfirm('sales')"
          >
            <ion-icon :icon="addCircleOutline" slot="start" />
            Add to Sales Order
          </ion-button>
          <ion-button
            expand="block"
            fill="outline"
            color="danger"
            :disabled="!selectedCustomer"
            class="conf-btn"
            @click="doConfirm('returns')"
          >
            <ion-icon :icon="returnDownBackOutline" slot="start" />
            Add to Return Order
          </ion-button>
          <ion-button expand="block" fill="clear" color="medium" @click="cancelConfirm">
            Cancel
          </ion-button>
        </template>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonBadge,
  IonModal,
  IonSearchbar,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  IonToggle,
  toastController,
  alertController,
} from '@ionic/vue';
import {
  syncOutline,
  timeOutline,
  cloudDownloadOutline,
  cloudOfflineOutline,
  alertCircleOutline,
  warningOutline,
  chevronDownOutline,
  chevronDownCircleOutline,
  calendarOutline,
  barcodeOutline,
  addCircleOutline,
  addOutline,
  removeOutline,
  returnDownBackOutline,
  trashOutline,
  cartOutline,
  storefrontOutline,
  checkmarkOutline,
  closeOutline,
  arrowForwardOutline,
  saveOutline,
  informationCircleOutline,
  refreshCircleOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore, computeTotal } from '@/stores/session.store';
import { useSync } from '@/composables/useSync';
import { usePriceListCheck } from '@/composables/usePriceListCheck';
import { useCustomerFilter } from '@/composables/useCustomerFilter';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useAppModeStore } from '@/stores/app-mode.store';
import { useTheme } from '@/composables/useTheme';
import { useGoldAccent } from '@/composables/useGoldAccent';
import { StorageService } from '@/services/storage.service';
import { ApiService } from '@/services/api.service';
import { formatCurrency, formatDiscount } from '@/utils/format';
import ItemSelectorModal from '@/components/ItemSelectorModal.vue';
import ProfileMenu from '@/components/ProfileMenu.vue';
import BugReportButton from '@/components/BugReportButton.vue';
import type { Customer, Item, ItemCategory, DiscountType } from '@/types';

/* ─── Stores / composables ─── */
const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();
const {
  isSyncing, syncError, syncWarning, lastSyncDate, lastSyncLabel,
  isCatalogEmpty, isTriggering, triggerMessage,
  sync, triggerRemoteSync,
} = useSync();
const { alerts: priceListAlerts, hasAlerts: hasPriceListAlerts, check: checkPriceLists, dismiss: dismissPriceListAlert } = usePriceListCheck();
const { isOnline, isSlowConnection } = useNetworkStatus();
const { mode: appMode } = useAppModeStore();
const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');
const headerLogoSrc = computed(() =>
  isMinimalist.value ? '/static/logo-bnw.png' : '/static/cons-logo.png',
);
const { headerPulseActive, submitFlashActive, triggerSubmitFlash } = useGoldAccent();

/* ─── Cached data ─── */
const cachedCustomers = ref<Customer[]>([]);
const cachedItems = ref<Item[]>([]);
const categories = ref<ItemCategory[]>([]);

/* hasCache must depend on the reactive component refs (not on
   StorageService directly) so it re-evaluates after refreshCache()
   updates them post-sync.  The useSync version reads _itemsMemory —
   a plain JS variable invisible to Vue's tracker — so it would
   always return the initial false value and never update. */
const hasCache = computed(
  () => cachedItems.value.length > 0 && cachedCustomers.value.length > 0 && categories.value.length > 0,
);

// In online mode, items are fetched live by ItemSelectorModal — no local cache required
const canScan = computed(
  () => hasCache.value || (appMode.value === 'online' && isOnline.value),
);

function refreshCache() {
  const brandCode = authStore.brand?.code;
  cachedCustomers.value = StorageService.getCachedCustomers(authStore.company?.code);
  const allItems = StorageService.getCachedItems();
  cachedItems.value = brandCode
    ? allItems.filter((i) => i.familyCode === brandCode)
    : allItems;
  categories.value = StorageService.getCachedItemCategories();
}

function onItemModalClose() {
  showItemModal.value = false;
  // In online mode the modal may have saved freshly fetched items to storage.
  // Refresh so cachedItems reflects what was just persisted.
  if (appMode.value === 'online') refreshCache();
}

onMounted(async () => {
  /* Restore items from IndexedDB before checking cache — ensures items
     are available after a browser refresh even when offline. */
  await StorageService.init();
  refreshCache();
  if (!sessionStore.currentSession && authStore.brand && authStore.user) {
    sessionStore.startNewSession(authStore.brand, authStore.user);
  }
  if (cachedItems.value.length === 0 && isOnline.value && appMode.value === 'offline') {
    await sync();
  } else if (isOnline.value) {
    checkPriceLists();
  }
});

/* ─── Sync ─── */
function doTriggerRemoteSync() {
  const company = authStore.company?.code ?? '';
  if (company) triggerRemoteSync(company);
}

function saveDraftAndGoHome() {
  sessionStore.saveAsDraftAndExit();
  router.replace('/app/home');
}

onBeforeRouteLeave(() => {
  sessionStore.autoSaveDraft();
});

async function onPullRefresh(ev: CustomEvent) {
  if (isOnline.value) {
    await sync();
    refreshCache();
  }
  (ev.target as HTMLIonRefresherElement).complete();
}

/* ─── Cycling sync messages ─── */
const syncMessages = [
  { main: 'Syncing data…',           sub: 'This may take a moment for large item lists.' },
  { main: 'Fetching items catalog…', sub: 'Downloading the full product list from the server.' },
  { main: 'Loading product data…',   sub: 'Organizing items for fast barcode lookup.' },
  { main: 'Preparing inventory…',    sub: 'Almost done — building your item cache.' },
  { main: 'Almost there…',           sub: 'Finishing up. Just a few seconds more.' },
];
const syncMsgIndex = ref(0);
let syncMsgTimer: ReturnType<typeof setInterval> | null = null;

/* ─── Slow-sync warning ─── */
const isSyncingSlow = ref(false);
let syncSlowTimer: ReturnType<typeof setTimeout> | null = null;

watch(isSyncing, (active) => {
  if (active) {
    syncMsgIndex.value = 0;
    syncMsgTimer = setInterval(() => {
      syncMsgIndex.value = (syncMsgIndex.value + 1) % syncMessages.length;
    }, 5000);
    syncSlowTimer = setTimeout(() => { isSyncingSlow.value = true; }, 10_000);
  } else {
    if (syncMsgTimer)  { clearInterval(syncMsgTimer);  syncMsgTimer  = null; }
    if (syncSlowTimer) { clearTimeout(syncSlowTimer);  syncSlowTimer = null; }
    syncMsgIndex.value  = 0;
    isSyncingSlow.value = false;
    refreshCache();
    if (isOnline.value) checkPriceLists();
    // Apply fresh prices to any open session lines — uses the price map already
    // written by sync, so no extra API calls are needed.
    const priceCache = StorageService.getCachedItemPrices();
    if (priceCache) {
      const allLines = [
        ...sessionStore.salesOrders.map((l) => ({ line: l, type: 'sales' as const })),
        ...sessionStore.returnOrders.map((l) => ({ line: l, type: 'returns' as const })),
      ];
      for (const { line, type } of allLines) {
        const price = priceCache.prices[line.itemNumber];
        if (price !== undefined && price !== line.srp) {
          sessionStore.updateLineSrp(line.id, type, price);
        }
      }
      if (form.itemNumber && priceCache.prices[form.itemNumber] !== undefined) {
        const price = priceCache.prices[form.itemNumber];
        form.srp = price;
        confirmedSrp.value = price;
      }
    }
  }
});

onUnmounted(() => {
  if (syncMsgTimer)  { clearInterval(syncMsgTimer);  syncMsgTimer  = null; }
  if (syncSlowTimer) { clearTimeout(syncSlowTimer);  syncSlowTimer = null; }
});

const syncMainMsg = computed(() => syncMessages[syncMsgIndex.value].main);
const syncSubMsg  = computed(() => syncMessages[syncMsgIndex.value].sub);

/* ─── Network notice ─── */
const networkNotice = computed<'offline' | 'slow' | null>(() => {
  if (!isOnline.value) return 'offline';
  if (isSlowConnection.value || isSyncingSlow.value) return 'slow';
  return null;
});

/* ─── Customer modal ─── */
const showCustomerModal = ref(false);
const customerSearch = ref('');
const customerFlash = ref(false);

const allCustomersRef = computed(() => cachedCustomers.value);
const customerSearchRef = computed(() => customerSearch.value);
const { filteredCustomers } = useCustomerFilter(allCustomersRef, customerSearchRef);

const selectedCustomer = computed(() => sessionStore.currentSession?.customer ?? null);

const orderDateValue = computed({
  get: () => sessionStore.currentSession?.postingDate ?? new Date().toISOString().split('T')[0],
  set: (val: string) => sessionStore.setPostingDate(val),
});

function selectCustomer(c: Customer) {
  sessionStore.setCustomer(c);
  showCustomerModal.value = false;
  customerSearch.value = '';
  customerFlash.value = true;
  setTimeout(() => { customerFlash.value = false; }, 450);
}

/* ─── Item form ─── */
const showItemModal = ref(false);
const activeTab = ref<'sales' | 'returns'>('sales');

interface ScanForm {
  categoryCode: string;
  itemNumber: string;
  itemName: string;
  description: string;
  srp: number;
  priceListCode: string;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
}

const form = reactive<ScanForm>({
  categoryCode: '',
  itemNumber: '',
  itemName: '',
  description: '',
  srp: 0,
  priceListCode: '',
  quantity: 1,
  discountType: 'percent',
  discountValue: 0,
});

const totalAmount = computed(() =>
  computeTotal(form.srp, form.quantity, form.discountType, form.discountValue),
);

const activeOrders = computed(() =>
  activeTab.value === 'sales' ? sessionStore.salesOrders : sessionStore.returnOrders,
);

const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
);

const appVersion = __APP_VERSION__;

/* ─── Confirm sheet ─── */
const showConfirmModal = ref(false);
const confirmItem = ref<Item | null>(null);
const confirmQty = ref(1);
const confirmDiscountType = ref<DiscountType>('percent');
const confirmDiscountValue = ref(0);

const confirmedSrp = ref(0);
const confirmedPriceListCode = ref('');
const fetchingPrice = ref(false);
const isUpdatingLinePrices = ref(false);
const priceRevealKey = ref(0);

const confirmTotal = computed(() =>
  computeTotal(
    confirmedSrp.value,
    confirmQty.value || 1,
    confirmDiscountType.value,
    confirmDiscountValue.value || 0,
  ),
);

// Returns price + priceListCode — cache-first, API only when date isn't cached.
async function lookupPrice(itemNumber: string, onDate: string): Promise<{ price: number | null; priceListCode: string | null }> {
  const cached = StorageService.getCachedItemPrices();
  if (cached?.date === onDate && itemNumber in cached.prices) {
    return { price: cached.prices[itemNumber], priceListCode: null };
  }
  if (isOnline.value) {
    return ApiService.getActiveItemPrice(itemNumber, onDate);
  }
  return { price: cached?.prices[itemNumber] ?? null, priceListCode: null };
}

async function fetchActivePrice(itemNumber: string, onDate: string): Promise<void> {
  fetchingPrice.value = true;
  try {
    const { price, priceListCode } = await lookupPrice(itemNumber, onDate);
    const resolved = price ?? confirmItem.value?.unitPriceIncVAT ?? 0;
    confirmedSrp.value = resolved;
    form.srp = resolved;
    priceRevealKey.value++;
    if (priceListCode !== null) {
      form.priceListCode = priceListCode;
      confirmedPriceListCode.value = priceListCode;
    }
    if (price !== null && isOnline.value) {
      StorageService.patchCachedItemPrice(itemNumber, price);
    }
  } finally {
    fetchingPrice.value = false;
  }
}

let _dateWatchAbort: AbortController | null = null;

watch(orderDateValue, async (newDate) => {
  if (!newDate) return;

  const allLines = [
    ...sessionStore.salesOrders.map((l) => ({ line: l, type: 'sales' as const })),
    ...sessionStore.returnOrders.map((l) => ({ line: l, type: 'returns' as const })),
  ];
  const hasFormItem = !!form.itemNumber;
  if (!allLines.length && !hasFormItem) return;

  // Offline: apply cached prices immediately — no network call, no loading state.
  if (!isOnline.value) {
    const priceMap = StorageService.getCachedItemPrices()?.prices ?? {};
    if (hasFormItem) {
      const price = priceMap[form.itemNumber] ?? null;
      if (price !== null) { confirmedSrp.value = price; form.srp = price; }
    }
    for (const { line, type } of allLines) {
      const price = priceMap[line.itemNumber] ?? null;
      if (price !== null) sessionStore.updateLineSrp(line.id, type, price);
    }
    return;
  }

  // Online: check cache first — prices for this date may already be loaded.
  const cachedForDate = StorageService.getCachedItemPrices();
  if (cachedForDate?.date === newDate) {
    const priceMap = cachedForDate.prices;
    if (hasFormItem) {
      const price = priceMap[form.itemNumber] ?? null;
      if (price !== null) { confirmedSrp.value = price; form.srp = price; }
    }
    for (const { line, type } of allLines) {
      const price = priceMap[line.itemNumber] ?? null;
      if (price !== null) sessionStore.updateLineSrp(line.id, type, price);
    }
    return;
  }

  // No cached prices for this date — fetch from API.
  _dateWatchAbort?.abort();
  _dateWatchAbort = new AbortController();
  const { signal } = _dateWatchAbort;

  const lineNos = allLines.map(({ line }) => line.itemNumber);
  const allNos = [...new Set(hasFormItem ? [form.itemNumber, ...lineNos] : lineNos)];

  isUpdatingLinePrices.value = true;
  let updatedCount = 0;
  try {
    const priceMap = await ApiService.getAllItemPricesForDate(newDate, allNos, signal);

    if (hasFormItem) {
      const price = priceMap[form.itemNumber] ?? null;
      if (price !== null) {
        confirmedSrp.value = price;
        form.srp = price;
        StorageService.patchCachedItemPrice(form.itemNumber, price);
      }
    }

    for (const { line, type } of allLines) {
      const price = priceMap[line.itemNumber] ?? null;
      if (price !== null) {
        sessionStore.updateLineSrp(line.id, type, price);
        updatedCount++;
        StorageService.patchCachedItemPrice(line.itemNumber, price);
      }
    }

    if (updatedCount > 0) {
      const t = await toastController.create({
        message: `${updatedCount} ${updatedCount === 1 ? 'item price' : 'item prices'} updated for ${newDate}.`,
        duration: 2500,
        position: 'bottom',
        color: 'success',
      });
      await t.present();
    }
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) return;
    throw err;
  } finally {
    isUpdatingLinePrices.value = false;
  }
});

watch(isOnline, async (online, wasOnline) => {
  if (!online || wasOnline) return; // only fires on offline → online transition
  const allLines = [
    ...sessionStore.salesOrders.map((l) => ({ line: l, type: 'sales' as const })),
    ...sessionStore.returnOrders.map((l) => ({ line: l, type: 'returns' as const })),
  ];
  if (!allLines.length && !form.itemNumber) return;
  const alert = await alertController.create({
    header: 'Connection Restored',
    message: 'Update item prices to their current rates?',
    buttons: [
      { text: 'Skip', role: 'cancel' },
      {
        text: 'Update Prices',
        handler: async () => {
          const hasFormItem = !!form.itemNumber;
          const lineNos = allLines.map(({ line }) => line.itemNumber);
          const allNos = [...new Set(hasFormItem ? [form.itemNumber, ...lineNos] : lineNos)];
          const priceMap = await ApiService.getAllItemPricesForDate(orderDateValue.value, allNos);
          if (hasFormItem) {
            const price = priceMap[form.itemNumber] ?? null;
            if (price !== null) {
              confirmedSrp.value = price;
              form.srp = price;
              StorageService.patchCachedItemPrice(form.itemNumber, price);
            }
          }
          for (const { line, type } of allLines) {
            const price = priceMap[line.itemNumber] ?? null;
            if (price !== null) {
              sessionStore.updateLineSrp(line.id, type, price);
              StorageService.patchCachedItemPrice(line.itemNumber, price);
            }
          }
        },
      },
    ],
  });
  await alert.present();
});

function onItemSelected(item: Item) {
  form.itemNumber = item.number;
  form.itemName = item.displayName;
  form.description = item.description || item.displayName;
  form.srp = item.unitPriceIncVAT;
  form.priceListCode = item.priceListCode ?? '';
  form.categoryCode = item.itemCategoryCode || form.categoryCode;
  form.quantity = 1;
  form.discountType = 'percent';
  form.discountValue = 0;
  showItemModal.value = false;
  confirmItem.value = item;
  confirmedSrp.value = item.unitPriceIncVAT;
  confirmedPriceListCode.value = item.priceListCode ?? '';
  confirmQty.value = 1;
  confirmDiscountType.value = 'percent';
  confirmDiscountValue.value = 0;
  showConfirmModal.value = true;
  fetchActivePrice(item.number, orderDateValue.value);
}

// Set before programmatically closing the confirm modal so the @did-dismiss
// handler can tell it apart from a user-initiated swipe-to-dismiss.
let _closingFromCode = false;

function cancelConfirm() {
  if (_closingFromCode) {
    // This @did-dismiss was triggered by our own close — ignore it so it
    // doesn't stomp on a modal that was already re-opened for the next item.
    _closingFromCode = false;
    return;
  }
  showConfirmModal.value = false;
}

function doConfirm(orderType: 'sales' | 'returns') {
  if (!confirmItem.value || !selectedCustomer.value) return;
  const item = confirmItem.value;
  const line = {
    itemNumber: item.number,
    itemName: item.displayName,
    description: item.description || item.displayName,
    srp: confirmedSrp.value,
    priceListCode: confirmedPriceListCode.value || undefined,
    quantity: Math.max(1, confirmQty.value || 1),
    discountType: confirmDiscountType.value,
    discountValue: Math.max(0, confirmDiscountValue.value || 0),
  };
  if (orderType === 'sales') {
    sessionStore.addSalesOrder(line);
    activeTab.value = 'sales';
  } else {
    sessionStore.addReturnOrder(line);
    activeTab.value = 'returns';
  }
  // Close and reset synchronously — before any await — so a rapid second item
  // selection cannot race with a delayed showConfirmModal = false.
  _closingFromCode = true;
  showConfirmModal.value = false;
  resetItemForm();
  triggerSubmitFlash();
  // Fire toast after close; do not await — avoids async gap where a new item
  // selection could be undone by this function resuming.
  toast(`${item.displayName} added to ${orderType === 'sales' ? 'Sales' : 'Returns'}`, 'success');
}

/* ─── Add lines ─── */
async function addToSales() {
  if (!form.itemNumber || !selectedCustomer.value) return;
  sessionStore.addSalesOrder({
    itemNumber: form.itemNumber,
    itemName: form.itemName,
    description: form.description,
    srp: form.srp,
    priceListCode: form.priceListCode || undefined,
    quantity: Math.max(1, form.quantity),
    discountType: form.discountType,
    discountValue: Math.max(0, form.discountValue),
  });
  resetItemForm();
  activeTab.value = 'sales';
  await toast(`${form.itemName || 'Item'} added to Sales`, 'success');
  triggerSubmitFlash();
}

async function addToReturn() {
  if (!form.itemNumber || !selectedCustomer.value) return;
  sessionStore.addReturnOrder({
    itemNumber: form.itemNumber,
    itemName: form.itemName,
    description: form.description,
    srp: form.srp,
    priceListCode: form.priceListCode || undefined,
    quantity: Math.max(1, form.quantity),
    discountType: form.discountType,
    discountValue: Math.max(0, form.discountValue),
  });
  resetItemForm();
  activeTab.value = 'returns';
  await toast(`${form.itemName || 'Item'} added to Returns`, 'success');
  triggerSubmitFlash();
}

function deleteActiveLine(lineId: string) {
  if (activeTab.value === 'sales') {
    sessionStore.removeSalesOrder(lineId);
  } else {
    sessionStore.removeReturnOrder(lineId);
  }
}

function resetItemForm() {
  /* Keep category; clear item-specific fields */
  form.itemNumber = '';
  form.itemName = '';
  form.description = '';
  form.srp = 0;
  form.priceListCode = '';
  form.quantity = 1;
  form.discountType = 'percent';
  form.discountValue = 0;
}

async function toast(message: string, color: string) {
  const t = await toastController.create({
    message,
    duration: 1800,
    color,
    position: 'bottom',
  });
  t.present();
}
</script>

<style scoped>
/* ── Header ── */
.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-logo { width: 28px; height: 28px; object-fit: contain; }
.header-text { display: flex; flex-direction: column; line-height: 1.2; }
.header-brand { font-size: inherit; font-weight: 700; }
.header-company { font-size: 10px; color: var(--app-text-muted); font-weight: 400; }

/* ── Sync sub-bar ── */
.sync-bar {
  --background: #1e1e1e;
  --border-color: rgba(255, 255, 255, 0.05);
  min-height: 32px;
}

.scanning--minimalist .sync-bar {
  --background: #f4f4f4;
  --border-color: #e4e4e4;
}
.scanning--minimalist .sync-info-text { color: rgba(0, 0, 0, 0.4); }
.scanning--minimalist .sync-today     { color: var(--app-gold); }
.scanning--minimalist .submit-bar {
  background: #f4f4f4;
  border-top-color: #e4e4e4;
}
.scanning--minimalist .submit-bar__count { color: rgba(0, 0, 0, 0.4); }
.sync-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  width: 100%;
  min-height: 32px;
}
.sync-info-text {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-2xs);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.3);
}
.sync-today { font-size: var(--text-2xs); font-weight: 600; color: var(--app-gold-light); }
.version-tag {
  opacity: 0.4;
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.offline-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--ion-color-warning-shade);
  background: rgba(var(--ion-color-warning-rgb), 0.18);
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.35);
  border-radius: 4px;
  padding: 2px 7px 2px 5px;
}
.offline-badge ion-icon { font-size: 11px; }

/* ── State cards ── */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  gap: 10px;
  text-align: center;
}
.state-card ion-icon { font-size: 52px; }
.state-card p { font-size: var(--text-md); font-weight: 600; color: var(--app-fg); margin: 0; }
.state-sub { font-size: 13px; color: var(--app-text-muted); margin: 0 !important; }

/* ── Sync error banner ── */
.sync-err-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--app-danger-bg);
  font-size: 13px;
  color: var(--ion-color-danger);
}

/* ── Sync warning banner ── */
.sync-warn-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(var(--ion-color-warning-rgb), 0.1);
  border-bottom: 1px solid rgba(var(--ion-color-warning-rgb), 0.25);
  font-size: 13px;
  color: var(--ion-color-warning-shade);
}
.sync-warn-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.sync-warn-trigger {
  align-self: flex-start;
  height: 30px;
  font-size: 12px;
}

/* ── Price list alert banner ── */
.price-list-alert-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(var(--ion-color-primary-rgb), 0.06);
  border-bottom: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
}
.price-list-alert-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
}
.price-list-alert-row--expired {
  color: var(--ion-color-warning-shade);
}
.price-list-alert-row--new-available {
  color: var(--ion-color-primary-shade);
}
.price-list-alert-row ion-icon {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 16px;
}
.price-list-alert-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 2px;
}

/* ── Trigger message ── */
.trigger-msg {
  font-size: 12px;
  color: var(--ion-color-success-shade);
  margin: 0;
  line-height: 1.4;
}
.trigger-msg--error {
  color: var(--ion-color-danger);
}

/* ── Network notice ── */
.net-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid transparent;
}
.net-notice ion-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}
.net-notice-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.net-notice-main {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.net-notice-sub {
  font-size: 11px;
  opacity: 0.8;
  line-height: 1.3;
}
.net-notice--offline {
  background: rgba(var(--ion-color-warning-rgb), 0.1);
  border-color: rgba(var(--ion-color-warning-rgb), 0.25);
  color: var(--ion-color-warning-shade);
}
.net-notice--slow {
  background: rgba(var(--ion-color-warning-rgb), 0.1);
  border-color: rgba(var(--ion-color-warning-rgb), 0.2);
  color: var(--ion-color-warning-shade);
}
.net-notice-fade-enter-active,
.net-notice-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.net-notice-fade-enter-from,
.net-notice-fade-leave-to    { opacity: 0; transform: translateY(-6px); }

/* ── Form card ── */
.form-card { margin: 10px 12px 0; }

.field-label {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--app-gold);
  margin: 0 0 10px;
}

/* ── Customer tap ── */
.customer-tap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 6px 0;
}
.cust-name { font-size: var(--text-md); font-weight: 700; color: var(--app-fg); margin: 0; letter-spacing: var(--tracking-tight); }
.cust-sub  { font-size: 12px; color: var(--app-text-muted); margin: 2px 0 0; }
.cust-placeholder { font-size: 14px; color: var(--app-text-muted); margin: 0; }

/* ── Item form body ── */
.item-form-body { padding-bottom: 8px; }

.form-row {
  --background: transparent;
  --padding-start: 0;
  --inner-padding-end: 0;
  --min-height: 48px;
}

.form-row--readonly {
  --background: var(--app-surface-alt);
  border-radius: 6px;
  margin: 2px 0;
}

.form-select { max-width: 200px; font-size: 14px; }

.item-trigger-end {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 200px;
}
.item-trigger-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
.item-trigger-placeholder { font-size: 13px; color: var(--app-text-muted); }

.readonly-val {
  font-size: 13px;
  color: var(--app-fg);
  text-align: right;
  max-width: 55%;
  white-space: normal;
  word-break: break-word;
}
.readonly-val--gold { color: var(--app-gold); font-weight: 700; }

.srp-date-hint {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  color: var(--app-text-muted);
  margin: 3px 0 0 2px;
  line-height: 1.4;
}
.srp-date-hint ion-icon { font-size: 12px; flex-shrink: 0; margin-top: 1px; }

.num-input {
  max-width: 80px;
  text-align: right;
  --padding-end: 0;
}

.disc-type-select { max-width: 90px; font-size: 13px; }

/* ── Total row ── */
.total-row {
  --background: var(--app-gold-pale);
  border-radius: 10px;
  margin-top: 8px;
}
.total-val {
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--app-gold);
  letter-spacing: var(--tracking-tighter);
  font-variant-numeric: tabular-nums;
}

/* ── Action buttons ── */
.action-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

/* ── No customer notice ── */
.no-cust-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 4px;
  font-size: 13px;
  color: var(--app-text-muted);
}
.no-cust-notice ion-icon { font-size: 18px; flex-shrink: 0; }
.no-cust-notice p { margin: 0; }

/* ── Price refresh banner ── */
.price-refresh-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--ion-color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ion-color-primary) 30%, transparent);
  border-radius: 8px;
  font-size: 13px;
  color: var(--ion-color-primary);
}
.price-refresh-spinner {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ── Order tabs / list ── */
.order-segment {
  margin: 12px 12px 0;
}

.order-list {
  background: var(--app-surface);
  margin: 0;
}

.tab-bdg {
  vertical-align: middle;
  margin-left: 4px;
  font-size: 11px;
  height: 18px;
  min-width: 18px;
  padding: 0 5px;
}

.line-total {
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  min-width: 56px;
  justify-content: flex-end;
}
.line-price-spinner { width: 16px; height: 16px; }

.price-list-code {
  display: inline-block;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(var(--ion-color-medium-rgb), 0.12);
  color: var(--ion-color-medium);
  font-size: 0.68em;
  font-weight: 600;
  letter-spacing: 0.03em;
  vertical-align: middle;
  white-space: nowrap;
}

.price-stale {
  opacity: 0.35;
  animation: price-pulse 1.4s ease-in-out infinite;
}

@keyframes price-pulse {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 0.65; }
}

@media (prefers-reduced-motion: reduce) {
  .price-stale,
  .customer-tap--flash,
  .skel-form-card,
  .skel-form-card--delay,
  .skel-sync-status,
  .cycling-text {
    animation: none !important;
  }
  .order-item-enter-active,
  .order-item-leave-active,
  .order-item-move,
  .price-reveal-enter-active,
  .price-reveal-leave-active {
    transition: none !important;
  }
}

.subtotal-row {
  --background: var(--app-surface-alt);
  border-top: 1px solid var(--app-border);
  --min-height: 44px;
}
.subtotal-val { font-size: var(--text-md); font-weight: 800; color: var(--app-fg); letter-spacing: var(--tracking-tighter); font-variant-numeric: tabular-nums; }

/* ── Empty orders ── */
.empty-orders {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 24px;
  gap: 10px;
  text-align: center;
}
.empty-orders ion-icon { font-size: 48px; }
.empty-orders p { font-size: 14px; color: var(--app-text-muted); line-height: 1.6; margin: 0; }

/* ── Submit bar ── */
.submit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 12px 20px;
  background: var(--app-dark);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  position: sticky;
  bottom: 0;
  z-index: 10;
}
.submit-bar__left { display: flex; flex-direction: column; gap: 2px; }
.submit-bar__count {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
}
.submit-bar__amount {
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--app-gold-light);
  letter-spacing: var(--tracking-tighter);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.submit-bar__btn {
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  --border-radius: 12px;
  height: 44px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.3px;
  box-shadow: 0 4px 16px rgba(160, 115, 32, 0.35);
  transition: transform 0.1s var(--ease-out-expo), box-shadow 0.1s ease;
}
.submit-bar__btn:active { transform: scale(0.97); box-shadow: none; }

/* ── Form fields reveal ── */
.form-fields-enter-active {
  transition: opacity 0.22s var(--ease-out-quart), transform 0.22s var(--ease-out-quart);
}
.form-fields-leave-active { transition: opacity 0.15s ease; }
.form-fields-enter-from   { opacity: 0; transform: translateY(-6px); }
.form-fields-leave-to     { opacity: 0; }

/* ── Submit bar slide-from-bottom ── */
.submit-bar-enter-active { transition: opacity 0.22s ease, transform 0.26s var(--ease-out-expo); }
.submit-bar-leave-active { transition: opacity 0.15s ease, transform 0.18s ease-in; }
.submit-bar-enter-from   { opacity: 0; transform: translateY(100%); }
.submit-bar-leave-to     { opacity: 0; transform: translateY(100%); }

/* ── Syncing skeleton ── */
.scan-skeleton {
  padding: 0;
}

.skel-form-card {
  margin: 10px 12px 0;
  background: var(--app-surface);
  border-radius: var(--app-radius-lg);
  border: 1px solid var(--app-border);
  padding: 16px;
  box-shadow: var(--app-shadow);
  animation: fade-slide-up 0.32s var(--ease-out-quart) both;
}

.skel-form-card--delay {
  animation-delay: 0.09s;
}

.skel-eyebrow {
  height: 9px;
  width: 70px;
  margin-bottom: 14px;
  border-radius: 4px;
}

.skel-cust-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 14px;
}

.skel-cust-name {
  height: 16px;
  width: 70%;
  border-radius: 6px;
}

.skel-cust-sub {
  height: 11px;
  width: 45%;
  border-radius: 4px;
}

.skel-divider {
  height: 1px;
  background: var(--app-border);
  margin: 4px 0 14px;
}

.skel-date-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skel-date-label {
  height: 9px;
  width: 80px;
  border-radius: 4px;
}

.skel-date-value {
  height: 15px;
  width: 50%;
  border-radius: 5px;
}

.skel-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--app-border);
}

.skel-field-label {
  height: 12px;
  width: 80px;
  border-radius: 4px;
}

.skel-field-value {
  height: 12px;
  width: 100px;
  border-radius: 4px;
}

.skel-sync-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 12px 0;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--ion-color-primary) 8%, transparent);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--ion-color-primary) 20%, transparent);
  animation: fade-in 0.35s ease 0.18s both;
}

.skel-sync-spinner {
  flex-shrink: 0;
  color: var(--app-gold);
}

.skel-sync-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.skel-sync-main {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-fg);
  display: block;
}

.skel-sync-sub {
  font-size: 11px;
  color: var(--app-text-muted);
  display: block;
}

/* ── Customer tap press feedback ── */
@keyframes customer-flash {
  0%   { background: var(--app-gold-pale); border-radius: 8px; }
  60%  { background: oklch(85% 0.065 74 / 0.55); }
  100% { background: transparent; border-radius: 0px; }
}

.customer-tap {
  transition: background 0.14s ease, border-radius 0.14s ease;
}
.customer-tap:active { background: var(--app-gold-pale); border-radius: 6px; }

.customer-tap--flash {
  animation: customer-flash 0.42s var(--ease-out-expo) both;
}

/* ── Action button press ── */
.action-btns ion-button {
  transition: transform 0.12s var(--ease-out-expo);
}
.action-btns ion-button:active { transform: scale(0.97); }

/* ── State card fade ── */
.state-card { animation: fade-in 0.3s ease both; }

/* ── Scan column entrance ── */
.scan-form-col .form-card:nth-child(1) { animation: fade-slide-up 0.32s var(--ease-out-quart) both; }
.scan-form-col .form-card:nth-child(2) { animation: fade-slide-up 0.32s var(--ease-out-quart) 0.07s both; }
.order-segment { animation: fade-in 0.28s ease 0.04s both; }
.empty-orders  { animation: fade-in 0.28s ease both; }

/* ── Order list: TransitionGroup item enter/leave ── */
.order-item-enter-active {
  transition: opacity 0.22s var(--ease-out-quart), transform 0.22s var(--ease-out-quart);
}
.order-item-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease-in;
  position: absolute;
  width: 100%;
}
.order-item-enter-from { opacity: 0; transform: translateX(-10px); }
.order-item-leave-to  { opacity: 0; transform: translateX(12px); }
.order-item-move {
  transition: transform 0.22s var(--ease-out-quart);
}

/* ── Customer modal internals ── */
.modal-brand-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: rgba(160, 115, 32, 0.14);
  color: var(--app-gold);
  border-radius: 4px;
  padding: 2px 6px;
  margin-left: 8px;
  vertical-align: middle;
}

.modal-empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 14px;
}

/* ── Confirm add sheet ── */
.conf-content {
  --background: var(--app-surface);
}

.conf-item-info {
  padding: 4px 0 20px;
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 20px;
}

.conf-item-name {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--app-fg);
  text-wrap: balance;
  margin: 0 0 6px;
  line-height: 1.3;
}

.conf-item-meta {
  font-size: 13px;
  color: var(--app-text-muted);
  margin-bottom: 8px;
}

.conf-item-num { font-weight: 600; }
.conf-item-cat { margin-left: 2px; }

.conf-item-srp {
  font-size: 22px;
  font-weight: 800;
  color: var(--app-gold);
  margin: 0;
}
.conf-srp-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-muted);
  margin-left: 4px;
}

.conf-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--app-warn-bg);
  border-radius: 8px;
  font-size: 13px;
  color: var(--app-warn-text);
  margin-bottom: 20px;
}

.conf-field-wrap {
  margin-bottom: 20px;
}

.conf-field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--app-gold);
  margin: 0 0 10px;
  text-transform: uppercase;
}

.conf-qty-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.conf-qty-btn {
  --border-radius: 8px;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.conf-qty-input {
  flex: 1;
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  color: var(--app-fg);
  --padding-start: 0;
  --padding-end: 0;
}

.conf-discount-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.conf-disc-seg {
  flex: 0 0 auto;
  width: 130px;
  --background: var(--app-surface-alt);
  border-radius: 8px;
  height: 38px;
}

.conf-disc-input {
  flex: 1;
  text-align: right;
  font-size: 22px;
  font-weight: 700;
  color: var(--app-fg);
  --padding-end: 4px;
  border-bottom: 2px solid var(--app-border);
}

.conf-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--app-gold-pale);
  border-radius: 10px;
  margin-bottom: 20px;
}

.conf-total-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.conf-total-value {
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--app-gold);
  letter-spacing: var(--tracking-tighter);
  font-variant-numeric: tabular-nums;
}

.conf-btn {
  margin-bottom: 10px;
}

/* ── Confirm sheet SRP price reveal ── */
.conf-srp-loading,
.conf-srp-value {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.srp-spinner { margin-right: 4px; vertical-align: middle; }

.price-reveal-enter-active {
  transition: opacity 0.22s ease, transform 0.22s var(--ease-out-quart);
}
.price-reveal-leave-active {
  transition: opacity 0.12s ease;
}
.price-reveal-enter-from { opacity: 0; transform: translateY(4px); }
.price-reveal-leave-to   { opacity: 0; }

/* ── Cycling text (shared pattern used by skeleton sync status) ── */
@keyframes text-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cycling-text {
  animation: text-appear 0.3s ease both;
}

/* ─── Responsive layout ─────────────────────────────────────────────────── */

/* Mobile default: single column, no extra wrapping */
.scan-panels {
  display: flex;
  flex-direction: column;
}

.scan-form-col,
.scan-list-col { min-width: 0; }

/* Tablet ≥768 px: side-by-side columns */
@media (min-width: 768px) {
  .scan-panels {
    flex-direction: row;
    align-items: flex-start;
    gap: 16px;
    padding: 14px 16px;
    max-width: 1120px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  /* Form column stays at a fixed width; list column fills the rest */
  .scan-form-col {
    flex: 0 0 340px;
    /* Stick to the top of the scrollable area so the form stays in view
       while a long order list scrolls past on the right */
    position: sticky;
    top: 0;
    align-self: flex-start;
  }

  .scan-list-col { flex: 1; }

  /* Cards inside the form column don't need horizontal gutter —
     scan-panels padding handles it */
  .form-card { margin: 0 0 12px; }

  /* Segment tab bar sticks to the top of the list column */
  .order-segment {
    margin: 0;
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--app-surface-alt);
  }

  /* State/empty cards shouldn't stretch across the full wide viewport */
  .state-card,
  .empty-orders {
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }
}

/* Desktop ≥1024 px: wider panels, more breathing room */
@media (min-width: 1024px) {
  .scan-panels {
    max-width: 1280px;
    padding: 16px 32px;
    gap: 24px;
  }

  .scan-form-col { flex: 0 0 400px; }
}

/* Landscape phone: trim vertical padding so the form fits without heavy scrolling */
@media (max-width: 767px) and (orientation: landscape) {
  .form-card { margin-top: 6px; }
  .form-card ion-card-content { padding-top: 10px; padding-bottom: 10px; }
  .field-label { margin-bottom: 6px; }
  .order-date-section { margin-top: 10px; padding-top: 10px; }
}

/* ─── Safe-area inset for notched phones ─────────────────────────────────── */
/* Ensures the sticky submit bar doesn't clip under the home indicator on iOS */
.submit-bar {
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

/* ─── Native date input: dark-mode color-scheme ──────────────────────────── */
/* Without this the browser renders the date picker chrome (calendar icon,
   spin buttons) in light mode even when the app is dark */
.order-date-input { color-scheme: light; }
[data-theme="dark"] .order-date-input { color-scheme: dark; }

/* ── Order date ── */
.order-date-section {
  border-top: 1px solid var(--app-border);
  margin-top: 14px;
  padding-top: 14px;
}

.no-sales-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--app-border);
  margin-top: 14px;
  padding-top: 12px;
}
.no-sales-label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.no-sales-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--app-fg);
  letter-spacing: 0.2px;
}
.no-sales-hint {
  font-size: 11px;
  color: var(--app-text-muted);
}
.no-sales-toggle {
  flex-shrink: 0;
}

.order-date-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.order-date-icon { font-size: 18px; flex-shrink: 0; }

.order-date-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-fg);
  font-family: inherit;
  padding: 4px 0;
}
</style>
