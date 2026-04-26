<script setup lang="ts">
/**
 * ControlBar — responsive toolbar row.
 *
 * Provides a flex-wrap row (.wt-controls) that holds SelectButtons, dropdowns,
 * and action buttons. On narrow screens controls wrap naturally.
 *
 * For SelectButton groups that may overflow horizontally, wrap them in a
 * ControlStrip (or use the .wt-control-strip CSS class directly) so the row
 * scrolls sideways without pushing other controls off-screen.
 *
 * Slots:
 *   default — any controls
 *
 * Usage:
 *   <ControlBar>
 *     <div class="wt-control-strip"><SelectButton … /></div>
 *     <ChartTypeSelector … />
 *   </ControlBar>
 */
defineOptions({ inheritAttrs: true })
</script>

<template>
  <div class="wt-controls">
    <slot />
  </div>
</template>
