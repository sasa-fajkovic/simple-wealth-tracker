<script setup lang="ts">
/**
 * PageShell — standard page wrapper.
 *
 * Provides:
 *  - `min-height: 100svh` (stable on mobile as browser chrome toggles)
 *  - Safe-area-inset padding for iOS notch / Android cutouts
 *  - Full-width content column via .wt-page-inner
 *
 * Usage:
 *   <PageShell>
 *     <h1>Page title</h1>
 *     ...content...
 *   </PageShell>
 *
 * Optional `class` on the outer div (e.g. a bg override) is forwarded via
 * Vue's inheritAttrs (default behaviour).
 */
defineOptions({ inheritAttrs: true })
</script>

<template>
  <div class="wt-page bg-gray-50 dark:bg-zinc-950">
    <div class="wt-page-inner">
      <slot />
    </div>
  </div>
</template>
