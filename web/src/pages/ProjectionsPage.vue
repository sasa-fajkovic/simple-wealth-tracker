<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getProjections, ApiError } from '../api/client'
import type { ProjectionsResponse } from '../types/index'
import ProjectionsChart from '../components/ProjectionsChart.vue'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { AreaChart, LineChart, BarChart2 } from 'lucide-vue-next'

const HORIZONS = [
  { label: '5Y',  value: 5  },
  { label: '10Y', value: 10 },
  { label: '20Y', value: 20 },
  { label: '30Y', value: 30 },
]

type ProjectionChartType = 'area' | 'line' | 'bar'
const CHART_OPTIONS: { label: string; value: ProjectionChartType }[] = [
  { label: 'Stacked Area', value: 'area' },
  { label: 'Line',         value: 'line' },
  { label: 'Stacked Bar',  value: 'bar'  },
]

const STORAGE_KEY = 'projections-chart-type'
function loadChartType(): ProjectionChartType {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'area' || stored === 'line' || stored === 'bar') return stored
  return 'area'
}

const horizon   = ref(10)
const chartType = ref<ProjectionChartType>(loadChartType())
const data      = ref<ProjectionsResponse | null>(null)
const loading   = ref(true)
const error     = ref<string | null>(null)
const retryCount = ref(0)
const hiddenCategories = ref<Set<string>>(new Set())

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

watch(chartType, (v) => localStorage.setItem(STORAGE_KEY, v))

function toggleCategory(id: string) {
  const next = new Set(hiddenCategories.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  hiddenCategories.value = next
}

function showAll() {
  hiddenCategories.value = new Set()
}

onMounted(() => { document.title = 'Projections — WealthTrack' })

async function loadProjections() {
  loading.value = true
  error.value   = null
  try {
    data.value = await getProjections(horizon.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

watch([horizon, retryCount], loadProjections, { immediate: true })

// ── Milestones ────────────────────────────────────────────────────────────────
// Anchor from today's calendar month, not the API boundary
const todayYM = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
})

function addYears(ym: string, years: number): string {
  const [y, m] = ym.split('-').map(Number)
  return `${y + years}-${String(m).padStart(2, '0')}`
}

const MILESTONE_YEARS = [1, 3, 5, 10, 20, 30]

const milestones = computed(() => {
  if (!data.value) return []
  const proj = data.value.projection
  const allMonths = [
    ...data.value.historical.months,
    ...proj.months,
  ]
  const allTotals = [
    ...data.value.historical.totals,
    ...proj.totals,
  ]
  const today = todayYM.value

  return MILESTONE_YEARS.map(years => {
    const targetYM = addYears(today, years)
    const idx = allMonths.indexOf(targetYM)
    return {
      label: `+${years}Y`,
      value: idx >= 0 ? fmt.format(allTotals[idx]) : 'N/A',
      available: idx >= 0,
    }
  })
})

// Current category values for breakdown sidebar
const categoryBreakdown = computed(() => {
  if (!data.value) return []
  return data.value.historical.category_breakdown
})

const anyHidden = computed(() => hiddenCategories.value.size > 0)
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">
      <!-- Controls row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <SelectButton
            v-model="horizon"
            :options="HORIZONS"
            option-label="label"
            option-value="value"
            class="whitespace-nowrap"
          />
        </div>
        <!-- Chart type selector (no pie) -->
        <SelectButton
          :model-value="chartType"
          :options="CHART_OPTIONS"
          option-label="label"
          option-value="value"
          @update:model-value="(v) => { if (v != null) chartType = v }"
        >
          <template #option="slotProps">
            <span :title="slotProps.option.label" class="flex items-center justify-center">
              <AreaChart  v-if="slotProps.option.value === 'area'" :size="16" />
              <LineChart  v-else-if="slotProps.option.value === 'line'" :size="16" />
              <BarChart2  v-else :size="16" />
            </span>
          </template>
        </SelectButton>
      </div>

      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load projections. Check your connection.</Message>
        <div class="mt-2">
          <Button label="Retry" link @click="retryCount++" />
        </div>
      </div>

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <div class="flex flex-col gap-4">
            <Skeleton height="14rem" border-radius="8px" />
            <Skeleton height="12rem" border-radius="8px" />
          </div>
          <Skeleton height="460px" border-radius="8px" />
        </div>
      </template>

      <!-- Main content -->
      <template v-else-if="data">
        <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
          <!-- Sidebar -->
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
                  v-for="row in categoryBreakdown"
                  :key="row.category_id"
                  :aria-pressed="!hiddenCategories.has(row.category_id)"
                  :class="[
                    'flex items-center justify-between text-sm font-medium w-full text-left rounded px-2 py-1 -mx-2 transition-opacity hover:bg-gray-50 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 border-0 bg-transparent cursor-pointer',
                    hiddenCategories.has(row.category_id) ? 'opacity-40' : 'opacity-100',
                  ]"
                  @click="toggleCategory(row.category_id)"
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
                  <span class="text-gray-900 dark:text-zinc-100 tabular-nums">{{ fmt.format(row.value) }}</span>
                </button>
              </div>
              <p class="text-xs text-gray-400 dark:text-zinc-500 mt-3">Click a category to toggle chart visibility</p>
            </div>

            <!-- Projection Milestones -->
            <div class="p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
              <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                Projected Milestones
              </p>
              <div class="flex flex-col gap-0">
                <div
                  v-for="m in milestones"
                  :key="m.label"
                  class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-zinc-800 last:border-0"
                >
                  <span class="text-sm text-gray-500 dark:text-zinc-400 font-medium">{{ m.label }}</span>
                  <span
                    :class="[
                      'text-sm font-semibold tabular-nums',
                      m.available ? 'text-gray-900 dark:text-zinc-100' : 'text-gray-400 dark:text-zinc-600',
                    ]"
                  >{{ m.value }}</span>
                </div>
              </div>
              <p class="text-xs text-gray-400 dark:text-zinc-500 mt-2">From today · solid = historical · dashed = projected</p>
            </div>
          </div>

          <!-- Chart -->
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
            <ProjectionsChart
              :data="data"
              :chart-type="chartType"
              :hidden-categories="hiddenCategories"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

