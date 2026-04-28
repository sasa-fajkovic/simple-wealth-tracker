<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSummary, getPersons, getAssets, ApiError } from '../api/client'
import type { SummaryResponse, RangeKey, Person, Asset } from '../types/index'
import ChartTypeSelector from '../components/ChartTypeSelector.vue'
import ChartCard from '../components/ui/ChartCard.vue'
import WealthChart from '../components/WealthChart.vue'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { useChartType } from '../composables/useChartType'
import { useDataRefresh } from '../composables/useDataRefresh'

const RANGES: { label: string; value: RangeKey }[] = [
  { label: 'YTD', value: 'ytd' }, { label: '6M',  value: '6m'  },
  { label: '1Y',  value: '1y'  }, { label: '2Y',  value: '2y'  },
  { label: '3Y',  value: '3y'  }, { label: '5Y',  value: '5y'  },
  { label: '10Y', value: '10y' }, { label: 'Max', value: 'max' },
]

const range = ref<RangeKey>('3y')
const persons = ref<Person[]>([])
const assets = ref<Asset[]>([])
const person = ref<string | null>(null)
const data = ref<SummaryResponse | null>(null)
const disabledSourceIds = ref<Set<string>>(new Set())
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const { chartType, setChartType } = useChartType('cashinflow-chart-type-v2', 'trend')
const { referenceDataVersion, dataPointsVersion } = useDataRefresh()
const router = useRouter()

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

async function loadPersons() {
  try {
    const list = await getPersons()
    persons.value = list
    if (person.value && !list.some(p => p.id === person.value)) person.value = null
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unexpected error loading people'
  }
}

async function loadAssets() {
  try {
    assets.value = await getAssets()
  } catch (err) {
    // Asset list is only used for click-drill resolution; failure is non-fatal
    console.warn('Income page: failed to load assets', err)
  }
}

onMounted(() => {
  document.title = 'Income — WealthTrack'
  loadPersons()
  loadAssets()
})

async function loadSummary() {
  loading.value = true
  error.value = null
  try {
    data.value = await getSummary(range.value, person.value ?? undefined, true)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

watch([range, person, retryCount, referenceDataVersion, dataPointsVersion], loadSummary, { immediate: true })
watch(person, () => { disabledSourceIds.value = new Set() })
watch(referenceDataVersion, () => {
  loadPersons()
  loadAssets()
})

const personOptions = computed(() => [
  { label: 'All', value: 'all' },
  ...persons.value.map(p => ({ label: p.name, value: p.id })),
])
const personValue = computed({
  get: () => person.value ?? 'all',
  set: (v: string) => { person.value = v === 'all' ? null : v },
})
const isEmpty = computed(() => !loading.value && data.value && data.value.series.length === 0)

// Summary stats — when person is selected, derive from enabled sources only
const totalInflow = computed(() => displayData.value?.current_total ?? data.value?.current_total ?? 0)
const monthsWithData = computed(() => {
  const totals = displayData.value?.totals ?? data.value?.totals
  if (!totals) return 0
  return totals.filter(t => t > 0).length
})
const avgMonthlyInflow = computed(() => {
  const months = monthsWithData.value
  return months > 0 ? totalInflow.value / months : 0
})
const chartTitle = computed(() => {
  if (chartType.value === 'trend') return 'Total Income Trend'
  return person.value === null ? 'Income by Person' : 'Income Sources'
})
const chartSubtitle = computed(() => {
  if (chartType.value === 'trend') return 'Total income over time.'
  return person.value === null ? 'All income grouped by person.' : 'Selected person split into individual income sources.'
})
// "All" view (person === null): top 5 click-to-drill list of people
const topSources = computed(() => {
  if (person.value !== null || !displayData.value) return []
  return [...displayData.value.category_breakdown]
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
})

// Per-person view: every source for that person, with an enabled/disabled flag.
// Built from the unfiltered data so that disabled rows still appear in the list
// (so the user can click them back on).
const personSources = computed(() => {
  if (person.value === null || !data.value) return []
  const groups = new Map<string, { id: string; name: string; color: string; total: number }>()
  data.value.asset_series.forEach((series, index) => {
    const total = series.values.reduce((sum, v) => sum + v, 0)
    if (total <= 0) return
    const existing = groups.get(series.asset_id)
    if (existing) {
      existing.total += total
    } else {
      groups.set(series.asset_id, {
        id: series.asset_id,
        name: series.asset_name,
        color: series.color || colorAt(index),
        total,
      })
    }
  })
  const enabledTotal = [...groups.values()]
    .filter(g => !disabledSourceIds.value.has(g.id))
    .reduce((sum, g) => sum + g.total, 0)
  return [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .map(g => ({
      category_id: g.id,
      category_name: g.name,
      color: g.color,
      value: g.total,
      pct_of_total: enabledTotal === 0 ? 0 : (g.total / enabledTotal) * 100,
      disabled: disabledSourceIds.value.has(g.id),
    }))
})

function selectTopSource(row: SummaryResponse['category_breakdown'][number]) {
  if (person.value !== null) return
  person.value = row.category_id
}

function toggleSource(id: string) {
  const next = new Set(disabledSourceIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  disabledSourceIds.value = next
}

const palette = ['#14b8a6', '#22c55e', '#6366f1', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

function colorAt(index: number): string {
  return palette[index % palette.length]
}

const personNameById = computed(() =>
  new Map(persons.value.map(p => [p.id, p.name]))
)

function personName(id: string): string {
  return personNameById.value.get(id) ?? id
}

const displayData = computed<SummaryResponse | null>(() => {
  if (!data.value) return null

  const groupByPerson = person.value === null
  const groups = new Map<string, {
    id: string
    name: string
    color: string
    values: number[]
  }>()

  data.value.asset_series.forEach((series, index) => {
    // When viewing a single person, allow excluding individual sources via toggle
    if (!groupByPerson && disabledSourceIds.value.has(series.asset_id)) return
    const id = groupByPerson ? series.person_id : series.asset_id
    const name = groupByPerson ? personName(series.person_id) : series.asset_name
    const existing = groups.get(id)
    if (existing) {
      existing.values = existing.values.map((value, valueIndex) => value + (series.values[valueIndex] ?? 0))
    } else {
      groups.set(id, {
        id,
        name,
        color: groupByPerson ? colorAt(groups.size) : series.color || colorAt(index),
        values: [...series.values],
      })
    }
  })

  const series = [...groups.values()]
    .filter(group => group.values.some(v => v > 0))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(group => ({
      category_id: group.id,
      category_name: group.name,
      color: group.color,
      category_type: 'cash-inflow' as const,
      values: group.values,
    }))

  // Recompute totals timeline + grand total based on the (possibly filtered) series
  const monthCount = data.value.months.length
  const totals = Array.from({ length: monthCount }, (_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
  )
  const currentTotal = totals.reduce((sum, v) => sum + v, 0)

  const category_breakdown = series.map(group => {
    const value = group.values.reduce((sum, v) => sum + v, 0)
    return {
      category_id: group.category_id,
      category_name: group.category_name,
      color: group.color,
      category_type: group.category_type,
      value,
      pct_of_total: currentTotal === 0 ? 0 : (value / currentTotal) * 100,
    }
  })

  return {
    ...data.value,
    series,
    totals,
    current_total: currentTotal,
    category_breakdown,
  }
})

const assetCategoryById = computed(() => new Map(assets.value.map(a => [a.id, a.category_id])))

function onChartPointClick(payload: { monthIndex: number; datasetIndex: number; datasetLabel: string }) {
  if (!data.value || !displayData.value) return
  const months = displayData.value.months
  const monthRaw = months[payload.monthIndex]
  if (!monthRaw) return
  const month = monthRaw.slice(0, 7)
  const query: Record<string, string> = { month }

  // Trend chart shows total only — no per-series filter (but carry active person)
  const isTotal = chartType.value === 'trend' || payload.datasetLabel === 'Total'
  const series = displayData.value.series[payload.datasetIndex]
  if (isTotal) {
    if (person.value !== null) query.person = person.value
  } else if (series) {
    if (person.value === null) {
      // Grouped by person → series id IS person_id
      if (persons.value.some(p => p.id === series.category_id)) {
        query.person = series.category_id
      }
    } else {
      // Grouped by asset for a specific person → carry person + map asset → category
      query.person = person.value
      const categoryId = assetCategoryById.value.get(series.category_id)
      if (categoryId) query.category = categoryId
    }
  }

  router.push({ path: '/monthly-update', query })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0" v-active-scroll>
          <SelectButton v-model="range" :options="RANGES" option-label="label" option-value="value" class="whitespace-nowrap wt-touch-select wt-soft-select wt-range-select" />
        </div>
        <ChartTypeSelector :value="chartType" @change="setChartType" />
      </div>

      <div v-if="persons.length > 0" class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 mb-3" v-active-scroll>
        <SelectButton v-model="personValue" :options="personOptions" option-label="label" option-value="value" class="whitespace-nowrap wt-touch-select wt-soft-select wt-person-select" />
      </div>

      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load data.</Message>
        <div class="mt-2">
          <Button label="Retry" link @click="retryCount++" />
        </div>
      </div>

      <!-- Summary cards -->
      <template v-if="data && !loading && !isEmpty">
        <div
          class="grid gap-3 mb-4"
          :class="(person === null ? topSources.length > 0 : personSources.length > 0)
            ? 'lg:grid-cols-[minmax(20rem,36rem)_minmax(0,1fr)]'
            : 'sm:grid-cols-2 lg:max-w-xl'"
        >
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
              <p class="text-[11px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Total Income</p>
              <p class="text-base font-bold text-green-600 dark:text-green-400 tabular-nums sm:text-lg">{{ eurFmt.format(totalInflow) }}</p>
            </div>
            <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
              <p class="text-[11px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Avg / Month</p>
              <p class="text-base font-bold text-gray-900 dark:text-zinc-100 tabular-nums sm:text-lg">{{ eurFmt.format(avgMonthlyInflow) }}</p>
            </div>
          </div>

          <!-- "All" view: top 5 income sources, click-to-drill into a person -->
          <div v-if="person === null && topSources.length > 0" class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Income by Person
            </p>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="row in topSources"
                :key="row.category_id"
                type="button"
                :aria-label="`Show only ${row.category_name}`"
                class="flex w-full appearance-none items-center gap-3 rounded-md border-0 bg-transparent px-2 py-1 text-left transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 dark:focus-visible:ring-emerald-500/40"
                @click="selectTopSource(row)"
              >
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: row.color }" />
                <span class="flex-1 text-sm text-gray-700 dark:text-zinc-300 truncate">{{ row.category_name }}</span>
                <span class="text-sm font-semibold text-gray-900 dark:text-zinc-100 tabular-nums">{{ eurFmt.format(row.value) }}</span>
                <span class="text-xs text-gray-400 dark:text-zinc-500 tabular-nums w-12 text-right">{{ row.pct_of_total.toFixed(1) }}%</span>
              </button>
            </div>
          </div>

          <!-- Per-person view: full source list, click to enable/disable each source -->
          <div v-else-if="person !== null && personSources.length > 0" class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Income Sources
            </p>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="row in personSources"
                :key="row.category_id"
                type="button"
                :aria-pressed="!row.disabled"
                :aria-label="`${row.disabled ? 'Enable' : 'Disable'} ${row.category_name}`"
                class="flex w-full appearance-none items-center gap-3 rounded-md border-0 bg-transparent px-2 py-1 text-left transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 dark:focus-visible:ring-emerald-500/40"
                :class="row.disabled ? 'opacity-50' : ''"
                @click="toggleSource(row.category_id)"
              >
                <span
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  :style="{ backgroundColor: row.color }"
                  :class="row.disabled ? 'ring-1 ring-gray-400 dark:ring-zinc-500' : ''"
                />
                <span
                  class="flex-1 text-sm text-gray-700 dark:text-zinc-300 truncate"
                  :class="row.disabled ? 'line-through' : ''"
                >{{ row.category_name }}</span>
                <span
                  class="text-sm font-semibold tabular-nums"
                  :class="row.disabled ? 'text-gray-400 dark:text-zinc-500 line-through' : 'text-gray-900 dark:text-zinc-100'"
                >{{ eurFmt.format(row.value) }}</span>
                <span class="text-xs text-gray-400 dark:text-zinc-500 tabular-nums w-12 text-right">
                  {{ row.disabled ? '—' : `${row.pct_of_total.toFixed(1)}%` }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </template>

      <Skeleton v-if="loading" height="420px" border-radius="8px" />

      <div v-else-if="isEmpty" class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
        <div class="text-center py-16 text-gray-400 dark:text-zinc-500">
          <p class="text-lg font-medium mb-2">No income data yet</p>
          <p class="text-sm">Create a category marked as <strong>Income</strong> in Admin, then add data points for it.</p>
        </div>
      </div>

      <ChartCard v-else-if="displayData" :title="chartTitle" :subtitle="chartSubtitle">
        <WealthChart :data="displayData" :chart-type="chartType" @point-click="onChartPointClick" />
      </ChartCard>
    </div>
  </div>
</template>
