<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  title?: string
  subtitle?: string
  /** Tailwind classes applied to the body wrapper (where the chart slot lives). */
  bodyClass?: string
  /** Disable the click-to-expand behaviour (e.g. for non-chart cards). */
  disableExpand?: boolean
}>()

const expanded = ref(false)

const containerClass = computed(() => {
  if (expanded.value) {
    return 'fixed inset-0 z-[1000] bg-white dark:bg-zinc-900 flex flex-col p-4 sm:p-6 overflow-auto'
  }
  return 'rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:p-4'
})

const bodyWrapperClass = computed(() => {
  if (expanded.value) return 'flex-1 min-h-0 flex flex-col'
  return ''
})

function open() {
  if (props.disableExpand) return
  expanded.value = true
}
function close() {
  expanded.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(expanded, async (v) => {
  if (v) {
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
  } else {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', onKey)
  }
  await nextTick()
  // Tell Chart.js (responsive: true) to recompute size after layout change.
  window.dispatchEvent(new Event('resize'))
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div :class="containerClass">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0 flex-1">
        <component
          :is="props.disableExpand ? 'div' : 'button'"
          v-if="title || subtitle || $slots.title"
          :type="props.disableExpand ? undefined : 'button'"
          :class="[
            'min-w-0 text-left w-full bg-transparent border-0 p-0 m-0',
            !props.disableExpand && 'group cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:focus-visible:ring-indigo-500/40 rounded',
          ]"
          @click="open"
        >
          <slot name="title">
            <div class="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-zinc-100">
              <span class="truncate">{{ title }}</span>
              <i v-if="!props.disableExpand" class="pi pi-window-maximize text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div v-if="subtitle" class="text-xs text-gray-500 dark:text-zinc-400 truncate">{{ subtitle }}</div>
          </slot>
        </component>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
        <button
          v-if="expanded"
          type="button"
          class="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:focus-visible:ring-indigo-500/40"
          aria-label="Close fullscreen"
          @click="close"
        >
          <i class="pi pi-times" />
        </button>
      </div>
    </div>

    <div :class="[bodyWrapperClass, props.bodyClass]">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* When expanded, force inner fixed-height chart wrappers to fill the screen. */
.fixed :deep([class*="h-["]) {
  height: 100% !important;
}
</style>
