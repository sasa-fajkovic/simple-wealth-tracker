<script setup lang="ts">
import { computed } from 'vue'
import type { SummaryResponse } from '../types/index'

const props = defineProps<{
  data: SummaryResponse
  hiddenCategories: Set<string>
  onToggleCategory: (id: string) => void
}>()

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const pctFormatter = new Intl.NumberFormat('de-DE', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatDelta(abs: number, pct: number) {
  const sign = abs >= 0 ? '+' : '\u2212'
  const pctSign = abs >= 0 ? '+' : '\u2212'
  return {
    text: `${sign}${eurFormatter.format(Math.abs(abs))} (${pctSign}${pctFormatter.format(Math.abs(pct))}%)`,
    positive: abs >= 0,
  }
}

const delta = computed(() => formatDelta(props.data.period_delta_abs, props.data.period_delta_pct))
const anyHidden = computed(() => props.hiddenCategories.size > 0)

function showAll() {
  props.data.category_breakdown.forEach(r => {
    if (props.hiddenCategories.has(r.category_id)) {
      props.onToggleCategory(r.category_id)
    }
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Category Breakdown -->
    <div class="p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Category Breakdown</p>
        <button
          v-if="anyHidden"
          class="text-xs text-indigo-500 hover:text-indigo-700 font-medium border-0 bg-transparent cursor-pointer p-0"
          @click="showAll"
        >
          Show all
        </button>
      </div>
      <div class="flex flex-col gap-2">
        <button
          v-for="row in data.category_breakdown"
          :key="row.category_id"
          :aria-pressed="!hiddenCategories.has(row.category_id)"
          :class="[
            'flex items-center justify-between text-sm font-medium w-full text-left rounded px-2 py-1 -mx-2 transition-opacity hover:bg-gray-50 dark:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 border-0 bg-transparent cursor-pointer',
            hiddenCategories.has(row.category_id) ? 'opacity-40' : 'opacity-100'
          ]"
          @click="onToggleCategory(row.category_id)"
        >
          <span class="flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: row.color }"
            />
            <span :class="['text-gray-700 dark:text-zinc-300', hiddenCategories.has(row.category_id) ? 'line-through' : '']">
              {{ row.category_name }}
            </span>
          </span>
          <span class="text-gray-900 dark:text-zinc-100 tabular-nums">{{ eurFormatter.format(row.value) }}</span>
        </button>
      </div>
      <p class="text-xs text-gray-400 dark:text-zinc-500 mt-3">Click a category to toggle chart visibility</p>
    </div>

    <!-- Total + Period Change -->
    <div class="p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
      <div class="flex flex-col gap-4">
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Total Net Worth</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-zinc-100 tabular-nums">
            {{ eurFormatter.format(data.current_total) }}
          </p>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Period Change</p>
          <p :class="['text-base font-semibold tabular-nums', delta.positive ? 'text-green-600' : 'text-red-600']">
            {{ delta.text }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
