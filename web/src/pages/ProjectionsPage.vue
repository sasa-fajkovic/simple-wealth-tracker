<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjections, getCategories, getAssets, ApiError } from '../api/client'
import type { ProjectionsResponse, ProjectionScenario, Category, Asset } from '../types/index'
import ProjectionsChart from '../components/ProjectionsChart.vue'
import ChartCard from '../components/ui/ChartCard.vue'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { AreaChart, LineChart, BarChart2, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useDataRefresh } from '../composables/useDataRefresh'

// ── Horizon ───────────────────────────────────────────────────────────────────
const HORIZONS = [
  { label: '5Y',  value: 5  },
  { label: '10Y', value: 10 },
  { label: '20Y', value: 20 },
  { label: '30Y', value: 30 },
]
const horizon = ref(10)
const customHorizonInput = ref('')

function applyCustomHorizon() {
  const n = parseInt(customHorizonInput.value, 10)
  if (!isNaN(n) && n >= 1 && n <= 30) horizon.value = n
}

watch(horizon, (years) => {
  customHorizonInput.value = String(years)
}, { immediate: true })

// ── Scenario ──────────────────────────────────────────────────────────────────
const SCENARIOS: { label: string; value: ProjectionScenario }[] = [
  { label: 'Conservative', value: 'conservative' },
  { label: 'Base',         value: 'base' },
  { label: 'Aggressive',   value: 'aggressive' },
]
const scenario = ref<ProjectionScenario>('base')

// ── Chart type ────────────────────────────────────────────────────────────────
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
const chartType = ref<ProjectionChartType>(loadChartType())
watch(chartType, (v) => localStorage.setItem(STORAGE_KEY, v))

// ── Sensitivity toggles ───────────────────────────────────────────────────────
// excludeLiabilities: hides liability categories from chart (frontend filter)
const excludeLiabilities = ref(false)

// ── Data loading ──────────────────────────────────────────────────────────────
const data      = ref<ProjectionsResponse | null>(null)
const loading   = ref(true)
const error     = ref<string | null>(null)
const retryCount = ref(0)
const { referenceDataVersion, dataPointsVersion } = useDataRefresh()
const router = useRouter()

function onProjectionsPointClick(payload: { monthIndex: number; month: string; categoryId: string | null }) {
  const query: Record<string, string> = { month: payload.month }
  if (payload.categoryId) query.category = payload.categoryId
  router.push({ path: '/monthly-update', query })
}

// ── Assumptions data ──────────────────────────────────────────────────────────
const categories = ref<Category[]>([])
const assets     = ref<Asset[]>([])
const assumptionsLoading = ref(false)
const assumptionsError = ref<string | null>(null)

async function loadAssumptions(force = false) {
  if (!force && categories.value.length > 0) return
  assumptionsLoading.value = true
  assumptionsError.value = null
  try {
    const [cats, assts] = await Promise.all([getCategories(), getAssets()])
    categories.value = cats
    assets.value     = assts
  } catch (err) {
    assumptionsError.value = err instanceof ApiError ? err.message : 'Could not load growth assumptions'
  } finally {
    assumptionsLoading.value = false
  }
}

// Wealth categories only (matching server-side filter)
const wealthCategories = computed(() =>
  categories.value.filter(c => c.type !== 'cash-inflow'),
)
// Assumption rows: one per wealth category, with asset overrides listed
const assumptionRows = computed(() =>
  wealthCategories.value.map(cat => {
    const catAssets = assets.value.filter(a => a.category_id === cat.id)
    const overrides = catAssets.filter(a => a.projected_yearly_growth !== null)
    return { cat, overrides }
  }),
)

// ── Category visibility ───────────────────────────────────────────────────────
const hiddenCategories = ref<Set<string>>(new Set())

function toggleCategory(id: string) {
  const next = new Set(hiddenCategories.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  hiddenCategories.value = next
}
function showAll() { hiddenCategories.value = new Set() }

// Effective hidden categories: user toggles + sensitivity toggle for liabilities
const effectiveHidden = computed(() => {
  if (!excludeLiabilities.value) return hiddenCategories.value
  const liabIds = new Set(
    data.value?.historical.series
      .filter(s => s.category_type === 'liability')
      .map(s => s.category_id) ?? [],
  )
  return new Set([...hiddenCategories.value, ...liabIds])
})

const anyHidden = computed(() => effectiveHidden.value.size > 0)

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const pctFmt = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })

type CategoryBreakdownRow = ProjectionsResponse['historical']['category_breakdown'][number]
type AssetBreakdownRow = ProjectionsResponse['historical']['asset_breakdown'][number]
const expandedCategoryId = ref<string | null>(null)

function categoryTypeLabel(type: CategoryBreakdownRow['category_type']): string {
  return type === 'cash-inflow' ? 'income' : type
}

function categoryBadgeClass(type: CategoryBreakdownRow['category_type']): string {
  if (type === 'liability') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  if (type === 'cash-inflow') return 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function toggleCategoryDetails(categoryId: string) {
  expandedCategoryId.value = expandedCategoryId.value === categoryId ? null : categoryId
}

function assetsForCategory(categoryId: string): AssetBreakdownRow[] {
  if (!data.value) return []
  return data.value.historical.asset_breakdown
    .filter(asset => asset.category_id === categoryId && asset.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.asset_name.localeCompare(b.asset_name))
}

onMounted(() => {
  document.title = 'Projections — WealthTrack'
  loadAssumptions()
})

async function loadProjections() {
  loading.value = true
  error.value   = null
  try {
    data.value = await getProjections(horizon.value, scenario.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

watch([horizon, scenario, retryCount, referenceDataVersion, dataPointsVersion], loadProjections, { immediate: true })
watch(referenceDataVersion, () => loadAssumptions(true))

// ── Projection anchor helpers ─────────────────────────────────────────────────
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

const projectionAnchorYM = computed(() => {
  const months = data.value?.historical.months ?? []
  return months.length > 0 ? months[months.length - 1] : todayYM.value
})

const projectionAnchorYear = computed(() => Number(projectionAnchorYM.value.slice(0, 4)))

const defaultTargetYear = computed(() => projectionAnchorYear.value + horizon.value)

// ── Milestones ────────────────────────────────────────────────────────────────
const MILESTONE_YEARS = [1, 3, 5, 10, 20, 30]

const milestones = computed(() => {
  if (!data.value) return []
  const proj = data.value.projection
  const allMonths = [...data.value.historical.months, ...proj.months]
  const allTotals = [...data.value.historical.totals, ...proj.totals]

  return MILESTONE_YEARS
    .filter(y => y <= horizon.value)
    .map(years => {
      const targetYM = addYears(projectionAnchorYM.value, years)
      const idx = allMonths.indexOf(targetYM)
      return {
        label: `+${years}Y`,
        year: targetYM.slice(0, 4),
        value: idx >= 0 ? fmt.format(allTotals[idx]) : 'N/A',
        available: idx >= 0,
      }
    })
})

// Custom milestone: user enters a target calendar year
const customMilestoneYear = ref(String(defaultTargetYear.value))
const customTargetYearInput = ref(String(defaultTargetYear.value))

watch(defaultTargetYear, (year) => {
  customMilestoneYear.value = String(year)
  customTargetYearInput.value = String(year)
}, { immediate: true })

function applyCustomTargetYear() {
  const targetYear = parseInt(customTargetYearInput.value, 10)
  if (isNaN(targetYear)) return
  const years = targetYear - projectionAnchorYear.value
  if (years < 1 || years > 30) return
  customMilestoneYear.value = String(targetYear)
  customHorizonInput.value = String(years)
  horizon.value = years
}

const customMilestoneValue = computed(() => {
  if (!data.value || !customMilestoneYear.value) return null
  const targetYear = parseInt(customMilestoneYear.value, 10)
  if (isNaN(targetYear)) return null
  const years = targetYear - projectionAnchorYear.value
  if (years < 1 || years > 30) return null
  const targetYM = addYears(projectionAnchorYM.value, years)
  const allMonths = [...data.value.historical.months, ...data.value.projection.months]
  const allTotals = [...data.value.historical.totals, ...data.value.projection.totals]
  const idx = allMonths.indexOf(targetYM)
  if (idx < 0) return 'Outside range — extend horizon'
  return fmt.format(allTotals[idx])
})

// ── Category breakdown (sidebar) ──────────────────────────────────────────────
const categoryBreakdown = computed(() => {
  if (!data.value) return []
  const rank: Record<CategoryBreakdownRow['category_type'], number> = {
    asset: 0,
    liability: 1,
    'cash-inflow': 2,
  }
  return [...data.value.historical.category_breakdown]
    .filter(row => row.value !== 0)
    .sort((a, b) => rank[a.category_type] - rank[b.category_type] || Math.abs(b.value) - Math.abs(a.value))
})

const categoryBreakdownGroups = computed(() => {
  const groups: { label: string; rows: CategoryBreakdownRow[] }[] = [
    { label: 'Assets', rows: categoryBreakdown.value.filter(row => row.category_type === 'asset') },
    { label: 'Liabilities', rows: categoryBreakdown.value.filter(row => row.category_type === 'liability') },
  ]
  return groups
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">

      <!-- ── Controls ─────────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-3 mb-4">

        <!-- Row 1: Horizon + Chart type -->
        <div class="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <div class="wt-control-strip max-w-full" v-active-scroll>
              <SelectButton
                v-model="horizon"
                :options="HORIZONS"
                option-label="label"
                option-value="value"
                aria-label="Projection horizon"
                class="whitespace-nowrap wt-touch-select wt-soft-select wt-range-select"
              />
            </div>
            <!-- Custom horizon input -->
            <div class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <label for="custom-horizon" class="text-xs text-gray-500 dark:text-zinc-400 sr-only">Custom years</label>
              <span class="text-xs font-medium text-gray-500 dark:text-zinc-400">Custom</span>
              <input
                id="custom-horizon"
                v-model="customHorizonInput"
                type="number"
                min="1"
                max="30"
                placeholder="10"
                aria-label="Custom horizon in years"
                class="wt-number-input wt-ghost-number-input h-9 w-10 rounded-full bg-gray-50 px-1 text-center text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-emerald-500/40"
                @keydown.enter="applyCustomHorizon"
              />
              <span class="text-xs text-gray-400 dark:text-zinc-500">years</span>
              <button
                class="min-h-8 rounded-full bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 dark:focus-visible:ring-emerald-500/40"
                aria-label="Apply custom horizon"
                @click="applyCustomHorizon"
              >
                Apply
              </button>
            </div>
            <!-- Custom target year input -->
            <div class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <label for="custom-target-year" class="sr-only text-xs text-gray-500 dark:text-zinc-400">Custom projection target year</label>
              <span class="text-xs font-medium text-gray-500 dark:text-zinc-400">Target year</span>
              <input
                id="custom-target-year"
                v-model="customTargetYearInput"
                type="number"
                :min="projectionAnchorYear + 1"
                :max="projectionAnchorYear + 30"
                :placeholder="`${defaultTargetYear}`"
                aria-label="Custom projection target year"
                class="wt-number-input wt-ghost-number-input h-9 w-16 rounded-full bg-gray-50 px-2 text-center text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-indigo-500/40"
                @keydown.enter="applyCustomTargetYear"
              />
              <button
                class="min-h-8 rounded-full bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 dark:focus-visible:ring-indigo-500/40"
                aria-label="Apply custom projection year"
                @click="applyCustomTargetYear"
              >
                Apply
              </button>
            </div>
          </div>
          <!-- Chart type selector -->
          <SelectButton
            :model-value="chartType"
            :options="CHART_OPTIONS"
            option-label="label"
            option-value="value"
            aria-label="Chart type"
            class="wt-touch-select wt-soft-select wt-chart-type-select"
            @update:model-value="(v) => { if (v != null) chartType = v }"
          >
            <template #option="slotProps">
              <span :title="slotProps.option.label" class="flex items-center justify-center gap-1.5">
                <AreaChart  v-if="slotProps.option.value === 'area'" :size="16" />
                <LineChart  v-else-if="slotProps.option.value === 'line'" :size="16" />
                <BarChart2  v-else :size="16" />
                <span class="text-xs">
                  {{ slotProps.option.value === 'area' ? 'Area' : slotProps.option.value === 'line' ? 'Line' : 'Bar' }}
                </span>
              </span>
            </template>
          </SelectButton>
        </div>

        <!-- Row 2: Scenario selector -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide min-w-[70px]">Scenario</span>
          <SelectButton
            v-model="scenario"
            :options="SCENARIOS"
            option-label="label"
            option-value="value"
            aria-label="Projection scenario"
            class="wt-touch-select wt-soft-select"
          />
          <span class="text-xs text-gray-400 dark:text-zinc-500 hidden sm:block">
            <template v-if="scenario === 'conservative'">0.5× stored growth rates</template>
            <template v-else-if="scenario === 'aggressive'">1.5× stored growth rates</template>
            <template v-else>Stored growth rates (default)</template>
          </span>
        </div>

        <!-- Row 3: Sensitivity toggles -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Sensitivity</span>
          <button
            :class="[
              'inline-flex items-center gap-1.5 min-h-10 px-3 text-xs font-medium rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:focus-visible:ring-indigo-500/40 min-w-[44px]',
              excludeLiabilities
                ? 'bg-gray-100/70 dark:bg-zinc-800/80 border-transparent text-gray-600 dark:text-zinc-300 hover:bg-gray-200/70 dark:hover:bg-zinc-700'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
            ]"
            :aria-pressed="excludeLiabilities"
            aria-label="Toggle: exclude liabilities from projection chart"
            @click="excludeLiabilities = !excludeLiabilities"
          >
            <span class="w-2 h-2 rounded-full" :class="excludeLiabilities ? 'bg-gray-300 dark:bg-zinc-600' : 'bg-rose-500'" />
            {{ excludeLiabilities ? 'Liabilities hidden' : 'Liabilities shown' }}
          </button>
        </div>
      </div>

      <!-- Error state -->
      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load projections. Check your connection.</Message>
        <div class="mt-2">
          <Button label="Retry" link @click="retryCount++" />
        </div>
      </div>

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div class="flex flex-col gap-4">
          <Skeleton height="460px" border-radius="8px" />
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton height="14rem" border-radius="8px" />
            <Skeleton height="12rem" border-radius="8px" />
            <Skeleton height="10rem" border-radius="8px" />
          </div>
        </div>
      </template>

      <!-- Main content -->
      <template v-else-if="data">
        <div class="flex flex-col gap-4">

          <!-- ── Top row: growth assumptions + chart ─────────────────────── -->
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,4fr)] lg:items-start">
            <!-- Growth Assumptions Panel -->
            <div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-zinc-900 dark:ring-zinc-800">
              <div class="flex min-h-[44px] items-center px-4 py-3">
                <p class="text-xs font-semibold text-gray-600 dark:text-zinc-300 uppercase tracking-wide">
                  Growth Assumptions
                </p>
              </div>

              <div
                id="assumptions-panel"
                class="wt-scrollbar-none max-h-[420px] overflow-y-auto px-4 pb-4"
              >
                <!-- Scenario reminder -->
                <div class="text-xs text-gray-500 dark:text-zinc-400 mb-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-zinc-800/60">
                  <template v-if="scenario === 'conservative'">
                    Conservative: displayed rates × 0.5 (half stored rates)
                  </template>
                  <template v-else-if="scenario === 'aggressive'">
                    Aggressive: displayed rates × 1.5 (1.5× stored rates)
                  </template>
                  <template v-else>
                    Base: rates as stored in Admin → Categories / Assets
                  </template>
                </div>

                <div v-if="assumptionsLoading" class="py-3 text-xs text-gray-400">Loading…</div>

                <Message v-else-if="assumptionsError" severity="warn" class="w-full text-sm">
                  Could not load growth assumptions: {{ assumptionsError }}
                </Message>

                <div v-else-if="assumptionRows.length === 0" class="text-xs text-gray-400 dark:text-zinc-500 py-2">
                  No wealth categories found. Add categories in Admin.
                </div>

                <div v-else class="flex flex-col gap-3">
                  <div
                    v-for="{ cat, overrides } in assumptionRows"
                    :key="cat.id"
                    class="text-xs"
                  >
                    <!-- Category row (click to toggle visibility on chart) -->
                    <button
                      type="button"
                      :aria-pressed="!effectiveHidden.has(cat.id)"
                      :disabled="excludeLiabilities && cat.type === 'liability'"
                      :class="[
                        'flex w-full items-center justify-between gap-2 py-1 rounded border-0 bg-transparent text-left transition-opacity',
                        excludeLiabilities && cat.type === 'liability'
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/60',
                        effectiveHidden.has(cat.id) ? 'opacity-40' : 'opacity-100',
                      ]"
                      @click="toggleCategory(cat.id)"
                    >
                      <span class="flex min-w-0 items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: cat.color }" />
                        <span :class="['truncate font-medium text-gray-700 dark:text-zinc-300', effectiveHidden.has(cat.id) ? 'line-through' : '']">
                          {{ cat.name }}
                        </span>
                      </span>
                      <span class="shrink-0 font-mono tabular-nums text-gray-900 dark:text-zinc-100">
                        {{ pctFmt.format(cat.projected_yearly_growth) }}/yr
                      </span>
                    </button>
                    <!-- Asset-level overrides -->
                    <div
                      v-for="asset in overrides"
                      :key="asset.id"
                      class="flex items-center justify-between gap-2 pl-4 py-0.5 text-gray-500 dark:text-zinc-400"
                    >
                      <span class="truncate">↳ {{ asset.name }}</span>
                      <span class="shrink-0 font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                        {{ pctFmt.format(asset.projected_yearly_growth!) }}/yr
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <ChartCard title="Net Worth Projection">
              <ProjectionsChart
                :data="data"
                :chart-type="chartType"
                :hidden-categories="effectiveHidden"
                @point-click="onProjectionsPointClick"
              />
            </ChartCard>
          </div>

          <!-- ── Detail panels below chart ───────────────────────────────── -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Category Breakdown</p>
              <button
                v-if="anyHidden"
                class="text-xs text-indigo-500 hover:text-indigo-700 font-medium border-0 bg-transparent cursor-pointer p-0"
                @click="showAll"
              >
                Show all
              </button>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
              <div
                v-for="group in categoryBreakdownGroups"
                :key="group.label"
                class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div class="mb-3 flex items-center justify-between">
                  <p
                    :class="[
                      'text-[11px] font-semibold uppercase tracking-wide',
                      group.label === 'Liabilities'
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                    ]"
                  >
                    {{ group.label }}
                  </p>
                </div>
                <div v-if="group.rows.length > 0" class="flex flex-col gap-1">
                  <div
                    v-for="row in group.rows"
                    :key="row.category_id"
                    class="-mx-2 rounded-lg"
                  >
                    <button
                      :aria-pressed="!effectiveHidden.has(row.category_id)"
                      :disabled="excludeLiabilities && row.category_type === 'liability'"
                      :class="[
                        'flex min-h-[56px] w-full flex-col gap-1 rounded-lg border-0 bg-transparent px-2 py-2 text-left text-sm font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:focus-visible:ring-indigo-500/40',
                        excludeLiabilities && row.category_type === 'liability'
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800',
                        effectiveHidden.has(row.category_id) ? 'opacity-40' : 'opacity-100',
                      ]"
                      @click="toggleCategory(row.category_id)"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: row.color }" />
                        <span :class="['whitespace-normal break-words text-gray-700 dark:text-zinc-300', effectiveHidden.has(row.category_id) ? 'line-through' : '']">
                          {{ row.category_name }}
                        </span>
                      </span>
                      <span class="flex items-center justify-between gap-3 pl-5">
                        <span :class="['rounded px-1.5 py-0.5 text-center text-[11px] font-semibold capitalize', categoryBadgeClass(row.category_type)]">
                          {{ categoryTypeLabel(row.category_type) }}
                        </span>
                        <span
                          :class="[
                            'shrink-0 tabular-nums',
                            row.category_type === 'liability' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-zinc-100',
                          ]"
                        >{{ fmt.format(row.value) }}</span>
                      </span>
                    </button>
                    <button
                      v-if="assetsForCategory(row.category_id).length > 0"
                      type="button"
                      class="ml-5 mb-1 inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:text-indigo-300 dark:hover:bg-indigo-950/30 dark:focus-visible:ring-indigo-500/40"
                      @click="toggleCategoryDetails(row.category_id)"
                    >
                      <ChevronUp v-if="expandedCategoryId === row.category_id" class="h-3 w-3" aria-hidden="true" />
                      <ChevronDown v-else class="h-3 w-3" aria-hidden="true" />
                      <span>{{ expandedCategoryId === row.category_id ? 'Hide details' : `${assetsForCategory(row.category_id).length} details` }}</span>
                    </button>
                    <div
                      v-if="expandedCategoryId === row.category_id"
                      class="ml-5 mb-2 flex flex-col gap-1 rounded-lg bg-gray-50 p-2 dark:bg-zinc-950/60"
                    >
                      <div
                        v-for="asset in assetsForCategory(row.category_id)"
                        :key="asset.asset_id"
                        class="flex items-start justify-between gap-2 border-b border-gray-200 py-1.5 last:border-0 dark:border-zinc-800"
                      >
                        <div class="min-w-0">
                          <p class="truncate text-xs font-medium text-gray-700 dark:text-zinc-300">{{ asset.asset_name }}</p>
                          <p class="text-[11px] text-gray-400 dark:text-zinc-500">{{ asset.person_id }}</p>
                        </div>
                        <p
                          class="shrink-0 text-xs font-semibold tabular-nums"
                          :class="asset.category_type === 'liability' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-zinc-100'"
                        >
                          {{ fmt.format(asset.value) }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 dark:border-zinc-800 dark:text-zinc-500">
                  No {{ group.label.toLowerCase() }} data
                </div>
              </div>

              <!-- Projection Milestones -->
              <div class="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                  Projected Milestones
                </p>
                <div class="flex flex-col gap-0">
                  <div
                    v-for="m in milestones"
                    :key="m.label"
                    class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-zinc-800 last:border-0"
                  >
                    <span class="flex items-baseline gap-1.5 text-sm font-medium">
                      <span class="text-gray-500 dark:text-zinc-400">{{ m.label }}</span>
                      <span class="text-xs font-medium text-gray-300 dark:text-zinc-600">{{ m.year }}</span>
                    </span>
                    <span
                      :class="[
                        'text-sm font-semibold tabular-nums',
                        m.available ? 'text-gray-900 dark:text-zinc-100' : 'text-gray-400 dark:text-zinc-600',
                      ]"
                    >{{ m.value }}</span>
                  </div>
                </div>
                <div class="mt-auto pt-3">
                  <!-- Custom milestone year -->
                  <div class="border-t border-gray-100 pt-2 dark:border-zinc-800">
                    <div class="flex flex-col items-end gap-2 text-right">
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-gray-500 dark:text-zinc-400">Target year</p>
                        <p class="mt-1 text-base font-bold text-gray-900 tabular-nums dark:text-zinc-100">
                          {{ customMilestoneYear }}
                        </p>
                      </div>
                      <div class="min-w-0 text-right">
                        <p class="text-xs font-medium text-gray-500 dark:text-zinc-400">Projected value</p>
                        <p
                          v-if="customMilestoneValue"
                          class="mt-1 truncate text-base font-bold text-gray-900 tabular-nums dark:text-zinc-100"
                        >{{ customMilestoneValue }}</p>
                      </div>
                    </div>
                  </div>
                  <p class="mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                    From latest data month {{ projectionAnchorYM }} · solid = historical · dashed = projected
                  </p>
                </div>
              </div>
            </div>

            <p class="text-xs text-gray-400 dark:text-zinc-500">
              Click a category to toggle chart visibility; open details to see the individual tracked items behind it.
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
