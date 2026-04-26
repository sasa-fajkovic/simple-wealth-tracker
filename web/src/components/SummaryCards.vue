<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SummaryResponse } from '../types/index'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

const props = defineProps<{
  data: SummaryResponse
  hiddenCategories: Set<string>
  onToggleCategory: (id: string) => void
}>()

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

const anyHidden = computed(() => props.hiddenCategories.size > 0)
const expandedCategoryId = ref<string | null>(null)

// Split breakdown into assets vs liabilities for clarity
const assetBreakdown = computed(() =>
  props.data.category_breakdown.filter(r => r.category_type === 'asset' && r.value !== 0)
)
const liabilityBreakdown = computed(() =>
  props.data.category_breakdown.filter(r => r.category_type === 'liability' && r.value !== 0)
)
const hasLiabilities = computed(() => liabilityBreakdown.value.length > 0)
const visibleAssetBreakdown = computed(() =>
  hasLiabilities.value ? assetBreakdown.value : props.data.category_breakdown.filter(r => r.value !== 0)
)

function assetsForCategory(categoryId: string) {
  return props.data.asset_breakdown
    .filter(asset => asset.category_id === categoryId && asset.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.asset_name.localeCompare(b.asset_name))
}

function toggleCategoryDetails(categoryId: string) {
  expandedCategoryId.value = expandedCategoryId.value === categoryId ? null : categoryId
}

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

      <!-- Assets section -->
      <template v-if="assetBreakdown.length > 0 || !hasLiabilities">
        <p v-if="hasLiabilities" class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Assets</p>
        <div class="flex flex-col gap-2">
          <div
            v-for="row in visibleAssetBreakdown"
            :key="row.category_id"
            class="-mx-2 rounded-lg"
          >
            <button
              :aria-pressed="!hiddenCategories.has(row.category_id)"
              :aria-label="`Toggle ${row.category_name} visibility in chart`"
              :class="[
                'flex items-center justify-between text-sm font-medium w-full text-left rounded px-2 py-1 transition-opacity hover:bg-gray-50 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 border-0 bg-transparent cursor-pointer',
                hiddenCategories.has(row.category_id) ? 'opacity-40' : 'opacity-100'
              ]"
              @click="onToggleCategory(row.category_id)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: row.color }" />
                <span :class="['truncate text-gray-700 dark:text-zinc-300', hiddenCategories.has(row.category_id) ? 'line-through' : '']">
                  {{ row.category_name }}
                </span>
              </span>
              <span class="shrink-0 text-gray-900 dark:text-zinc-100 tabular-nums">{{ eurFormatter.format(row.value) }}</span>
            </button>
            <button
              v-if="assetsForCategory(row.category_id).length > 0"
              type="button"
              class="ml-5 mt-1 inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:text-indigo-300 dark:hover:bg-indigo-950/30 dark:focus-visible:ring-indigo-500/40"
              @click="toggleCategoryDetails(row.category_id)"
            >
              <ChevronUp v-if="expandedCategoryId === row.category_id" class="h-3 w-3" aria-hidden="true" />
              <ChevronDown v-else class="h-3 w-3" aria-hidden="true" />
              <span>{{ expandedCategoryId === row.category_id ? 'Hide details' : `${assetsForCategory(row.category_id).length} details` }}</span>
            </button>
            <div
              v-if="expandedCategoryId === row.category_id"
              class="ml-5 mt-1 flex flex-col gap-1 rounded-lg bg-gray-50 p-2 dark:bg-zinc-950/60"
            >
              <div
                v-for="asset in assetsForCategory(row.category_id)"
                :key="asset.asset_id"
                class="flex items-start justify-between gap-2 border-b border-gray-200 py-1.5 last:border-0 dark:border-zinc-800"
              >
                <p class="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-zinc-300">{{ asset.asset_name }}</p>
                <p class="shrink-0 text-xs font-semibold tabular-nums text-gray-900 dark:text-zinc-100">
                  {{ eurFormatter.format(asset.value) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Liabilities section -->
      <template v-if="hasLiabilities">
        <p class="text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mt-3 mb-1">Liabilities</p>
        <div class="flex flex-col gap-2">
          <div
            v-for="row in liabilityBreakdown"
            :key="row.category_id"
            class="-mx-2 rounded-lg"
          >
            <button
              :aria-pressed="!hiddenCategories.has(row.category_id)"
              :aria-label="`Toggle ${row.category_name} visibility in chart`"
              :class="[
                'flex items-center justify-between text-sm font-medium w-full text-left rounded px-2 py-1 transition-opacity hover:bg-gray-50 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 border-0 bg-transparent cursor-pointer',
                hiddenCategories.has(row.category_id) ? 'opacity-40' : 'opacity-100'
              ]"
              @click="onToggleCategory(row.category_id)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: row.color }" />
                <span :class="['truncate text-gray-700 dark:text-zinc-300', hiddenCategories.has(row.category_id) ? 'line-through' : '']">
                  {{ row.category_name }}
                </span>
              </span>
              <span class="shrink-0 text-red-600 dark:text-red-400 tabular-nums">{{ eurFormatter.format(row.value) }}</span>
            </button>
            <button
              v-if="assetsForCategory(row.category_id).length > 0"
              type="button"
              class="ml-5 mt-1 inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:text-indigo-300 dark:hover:bg-indigo-950/30 dark:focus-visible:ring-indigo-500/40"
              @click="toggleCategoryDetails(row.category_id)"
            >
              <ChevronUp v-if="expandedCategoryId === row.category_id" class="h-3 w-3" aria-hidden="true" />
              <ChevronDown v-else class="h-3 w-3" aria-hidden="true" />
              <span>{{ expandedCategoryId === row.category_id ? 'Hide details' : `${assetsForCategory(row.category_id).length} details` }}</span>
            </button>
            <div
              v-if="expandedCategoryId === row.category_id"
              class="ml-5 mt-1 flex flex-col gap-1 rounded-lg bg-gray-50 p-2 dark:bg-zinc-950/60"
            >
              <div
                v-for="asset in assetsForCategory(row.category_id)"
                :key="asset.asset_id"
                class="flex items-start justify-between gap-2 border-b border-gray-200 py-1.5 last:border-0 dark:border-zinc-800"
              >
                <p class="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-zinc-300">{{ asset.asset_name }}</p>
                <p class="shrink-0 text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {{ eurFormatter.format(asset.value) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <p class="text-xs text-gray-400 dark:text-zinc-500 mt-3">Click a category to toggle chart visibility; open details to see tracked items.</p>
    </div>

  </div>
</template>
