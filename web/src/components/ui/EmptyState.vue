<script setup lang="ts">
/**
 * EmptyState — centred empty / error / zero-data placeholder.
 *
 * Props:
 *   icon    — PrimeIcons class (e.g. "pi pi-inbox") or lucide icon component
 *   title   — primary message
 *   message — (optional) secondary message / hint
 *
 * Usage:
 *   <EmptyState icon="pi pi-inbox" title="No assets found">
 *     Add assets in <strong>Admin</strong> to start tracking.
 *   </EmptyState>
 *
 * The default slot replaces `message` if provided.
 */
defineProps<{
  icon?: string
  title: string
  message?: string
}>()
</script>

<template>
  <div class="wt-empty">
    <i v-if="icon" :class="[icon, 'wt-empty-icon']" />
    <p class="text-base font-medium text-gray-700 dark:text-zinc-300">{{ title }}</p>
    <p v-if="$slots.default || message" class="text-sm">
      <slot>{{ message }}</slot>
    </p>
  </div>
</template>
