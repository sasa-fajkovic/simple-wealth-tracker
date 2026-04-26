<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Line, Bar, Doughnut, PolarArea, Radar, Scatter, Bubble } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
  DoughnutController,
  PolarAreaController,
  LineController,
  BarController,
  RadarController,
  ScatterController,
  BubbleController,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
  type ScatterDataPoint,
  type BubbleDataPoint,
} from 'chart.js'
import { getSummary, getPersons, ApiError } from '../api/client'
import type { SummaryResponse, RangeKey, Person } from '../types/index'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { useTheme } from '../composables/useTheme'
import { getChartTokens, buildTooltipDefaults, wealthColors } from '../theme/tokens'
import { eurFmt, compactFmt } from '../utils/formatters'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, RadialLinearScale, Filler, Tooltip, Legend,
  DoughnutController, PolarAreaController,
  LineController, BarController, RadarController, ScatterController, BubbleController,
)

// Chart.js mixed charts combine datasets of different types (bar + line).
// TypeScript doesn't have a built-in ChartData type for this; we use a local
// structural union so the datasets are still typed rather than `any`.
type MixedDataset =
  | ({ type: 'bar' } & Omit<import('chart.js').ChartDataset<'bar'>, 'type'>)
  | ({ type: 'line' } & Omit<import('chart.js').ChartDataset<'line'>, 'type'>)

// ── Radar dimension definitions ───────────────────────────────────────────────
interface RadarDim { key: string; label: string; re?: RegExp }
const RADAR_DIMS: RadarDim[] = [
  { key: 'liquidity',    label: 'Liquidity',    re: /cash|savings?|bank|deposit|tekuć|žiro|štednja/i },
  { key: 'growth',       label: 'Growth',        re: /stock|equity|etf|fund|share|invest|dionice?|akcij|burza/i },
  { key: 'real_estate',  label: 'Real Estate',   re: /real\s*estate|property|house|apartment|flat|land|nekretnin|stan|kuć|zemlja/i },
  { key: 'crypto',       label: 'Crypto',        re: /crypto|bitcoin|btc|eth(?:ereum)?|coin|token/i },
  { key: 'other',        label: 'Other Assets' },
  { key: 'inflow',       label: 'Cash Inflow' },
  { key: 'debt',         label: 'Debt' },
]

function classifyCategory(name: string, type: string): string {
  if (type === 'liability') return 'debt'
  if (type === 'cash-inflow') return 'inflow'
  for (const dim of RADAR_DIMS) {
    if (dim.key === 'other' || dim.key === 'inflow' || dim.key === 'debt') continue
    if (dim.re && dim.re.test(name)) return dim.key
  }
  return 'other'
}

type CategoryBreakdownRow = SummaryResponse['category_breakdown'][number]
type AssetBreakdownRow = SummaryResponse['asset_breakdown'][number]
type ContributorMode = 'categories' | 'assets' | 'people'
type DrilldownType = CategoryBreakdownRow['category_type']

interface ContributorRow {
  id: string
  name: string
  type: CategoryBreakdownRow['category_type'] | 'person'
  color: string
  value: number
}

function categoryTypeLabel(type: CategoryBreakdownRow['category_type']): string {
  return type === 'cash-inflow' ? 'inflow' : type
}

function drilldownTypeLabel(type: DrilldownType): string {
  if (type === 'cash-inflow') return 'cash inflow'
  return type === 'liability' ? 'liabilities' : 'assets'
}

function trackedItemLabel(type: DrilldownType, count: number): string {
  if (type === 'cash-inflow') return `cash inflow source${count === 1 ? '' : 's'}`
  if (type === 'liability') return `liabilit${count === 1 ? 'y' : 'ies'}`
  return `asset${count === 1 ? '' : 's'}`
}

function categoryBadgeClass(type: CategoryBreakdownRow['category_type']): string {
  if (type === 'liability') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  if (type === 'cash-inflow') return 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
}

const sortedCategoryBreakdown = computed(() => {
  if (!data.value) return []
  const rank: Record<CategoryBreakdownRow['category_type'], number> = {
    asset: 0,
    liability: 1,
    'cash-inflow': 2,
  }
  return [...data.value.category_breakdown]
    .filter(row => row.value !== 0)
    .sort((a, b) => rank[a.category_type] - rank[b.category_type] || Math.abs(b.value) - Math.abs(a.value))
})

const RANGES: { label: string; value: RangeKey }[] = [
  { label: 'YTD', value: 'ytd' }, { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' }, { label: '2Y', value: '2y' },
  { label: '3Y', value: '3y' }, { label: '5Y', value: '5y' },
  { label: '10Y', value: '10y' }, { label: 'Max', value: 'max' },
]

const range = ref<RangeKey>('ytd')
const persons = ref<Person[]>([])
const person = ref<string | null>(null)
const contributorMode = ref<ContributorMode>('categories')
const drilldownType = ref<DrilldownType>('asset')
const selectedCategoryId = ref<string | null>(null)
const data = ref<SummaryResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const personsError = ref<string | null>(null)
const retryCount = ref(0)
const { theme } = useTheme()

onMounted(() => {
  document.title = 'Analytics — WealthTrack'
  getPersons()
    .then(list => { persons.value = list })
    .catch(err => {
      personsError.value = err instanceof ApiError ? err.message : 'Could not load person filter'
    })
})

async function loadData() {
  loading.value = true
  error.value = null
  try {
    data.value = await getSummary(range.value, person.value ?? undefined)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

watch([range, person, retryCount], loadData, { immediate: true })

const personOptions = computed(() => [
  { label: 'All', value: 'all' },
  ...persons.value.map(p => ({ label: p.name, value: p.id })),
])
const personValue = computed({
  get: () => person.value ?? 'all',
  set: (v: string) => { person.value = v === 'all' ? null : v },
})

const contributorModes: { label: string; value: ContributorMode }[] = [
  { label: 'Categories', value: 'categories' },
  { label: 'Assets', value: 'assets' },
  { label: 'People', value: 'people' },
]

const drilldownTypeOptions: { label: string; value: DrilldownType }[] = [
  { label: 'Assets', value: 'asset' },
  { label: 'Liabilities', value: 'liability' },
  { label: 'Cash Inflow', value: 'cash-inflow' },
]

const personNameById = computed(() =>
  new Map(persons.value.map(p => [p.id, p.name]))
)

const palette = [
  wealthColors.assets.indigo,
  wealthColors.assets.blue,
  wealthColors.assets.emerald,
  wealthColors.cashInflow.teal,
  wealthColors.liabilities.orange,
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f59e0b',
  '#ec4899',
]

function colorAt(index: number): string {
  return palette[index % palette.length]
}

function personName(id: string): string {
  return personNameById.value.get(id) ?? id
}

const assetBreakdownRows = computed((): AssetBreakdownRow[] => {
  if (!data.value) return []
  return [...data.value.asset_breakdown]
    .filter(row => row.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.asset_name.localeCompare(b.asset_name))
})

const personBreakdownRows = computed((): ContributorRow[] => {
  if (!data.value) return []
  const byPerson = new Map<string, ContributorRow>()
  data.value.asset_breakdown.forEach((row, index) => {
    if (row.value === 0) return
    const existing = byPerson.get(row.person_id)
    if (existing) {
      existing.value += row.value
    } else {
      byPerson.set(row.person_id, {
        id: row.person_id,
        name: personName(row.person_id),
        type: 'person',
        color: colorAt(index),
        value: row.value,
      })
    }
  })
  return [...byPerson.values()]
    .filter(row => row.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.name.localeCompare(b.name))
})

const contributorRows = computed((): ContributorRow[] => {
  if (!data.value) return []
  if (contributorMode.value === 'assets') {
    return assetBreakdownRows.value.map(row => ({
      id: row.asset_id,
      name: row.asset_name,
      type: row.category_type,
      color: row.color,
      value: row.value,
    }))
  }
  if (contributorMode.value === 'people') return personBreakdownRows.value
  return sortedCategoryBreakdown.value.map(row => ({
    id: row.category_id,
    name: row.category_name,
    type: row.category_type,
    color: row.color,
    value: row.value,
  }))
})

const categoryDrilldownRows = computed(() => {
  if (!data.value) return []
  return sortedCategoryBreakdown.value
    .filter(row => row.category_type === drilldownType.value)
    .map(row => {
      const assets = data.value!.asset_breakdown
        .filter(asset => asset.category_id === row.category_id && asset.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.asset_name.localeCompare(b.asset_name))
      return { ...row, assets }
    })
    .filter(row => row.assets.length > 0)
})

const activeCategoryId = computed(() =>
  selectedCategoryId.value ?? categoryDrilldownRows.value[0]?.category_id ?? null
)

const selectedCategoryDrilldown = computed(() =>
  categoryDrilldownRows.value.find(row => row.category_id === activeCategoryId.value) ?? null
)

function selectCategory(categoryId: string) {
  selectedCategoryId.value = categoryId
}

watch(drilldownType, () => {
  selectedCategoryId.value = null
})

// ── Chart 1: Net Worth Trend (Line) ───────────────────────────────────────────
const trendData = computed((): ChartData<'line'> => {
  if (!data.value) return { labels: [], datasets: [] }
  const t = getChartTokens(theme.value === 'dark')
  return {
    labels: data.value.months.map(m => m.slice(0, 7)),
    datasets: [
      {
        label: 'Net Worth',
        data: data.value.totals,
        borderColor: t.totalLine,
        backgroundColor: t.totalLine + '33',
        fill: true,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 3,
      },
    ],
  }
})

const trendOptions = computed((): ChartOptions<'line'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => ` ${eurFmt.format((ctx.parsed as { y: number }).y)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: {
          color: t.tick,
          font: { size: 11 },
          callback: (v) => compactFmt.format(v as number),
        },
      },
    },
  }
})

// ── Chart 2: Current Allocation Doughnut ──────────────────────────────────────
const allocationData = computed((): ChartData<'doughnut'> => {
  if (!data.value) return { labels: [], datasets: [{ data: [] }] }
  const assetRows = data.value.category_breakdown.filter(r => r.category_type === 'asset' && r.value > 0)
  return {
    labels: assetRows.map(r => r.category_name),
    datasets: [{
      data: assetRows.map(r => r.value),
      backgroundColor: assetRows.map(r => r.color + 'cc'),
      borderColor: assetRows.map(r => r.color),
      borderWidth: 2,
    }],
  }
})

const doughnutOptions = computed((): ChartOptions<'doughnut'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: t.legend, boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 8 },
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: unknown) => a + (b as number), 0)
            const value = ctx.raw as number
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return ` ${eurFmt.format(value)}  (${pct}%)`
          },
        },
      },
      datalabels: { display: false },
    },
  }
})

// ── Chart 3: Top Contributors (Horizontal Bar) ────────────────────────────────
const topContributorsData = computed((): ChartData<'bar'> => {
  if (!data.value) return { labels: [], datasets: [{ data: [] }] }
  const rows = contributorRows.value.slice(0, contributorMode.value === 'assets' ? 12 : 8)
  return {
    labels: rows.map(r => r.name),
    datasets: [{
      label: 'Current Value',
      data: rows.map(r => r.value),
      backgroundColor: rows.map(r => r.color + 'cc'),
      borderColor: rows.map(r => r.color),
      borderWidth: 1,
    }],
  }
})

const horizontalBarOptions = computed((): ChartOptions<'bar'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => ` ${eurFmt.format((ctx.parsed as { x: number }).x)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 } },
      },
    },
  }
})

// ── Chart 4: Assets vs Liabilities Over Time (Grouped Bar) ───────────────────
const hasLiabilitySeries = computed(() =>
  data.value?.series.some(s => s.category_type === 'liability' && s.values.some(v => v !== 0)) ?? false
)

const assetsVsLiabilitiesData = computed((): ChartData<'bar'> => {
  if (!data.value) return { labels: [], datasets: [] }
  const assetSeries = data.value.series.filter(s => s.category_type === 'asset')
  const liabilitySeries = data.value.series.filter(s => s.category_type === 'liability')
  const grossAssets = data.value.months.map((_, i) =>
    assetSeries.reduce((sum, s) => sum + s.values[i], 0)
  )
  const totalLiabilities = data.value.months.map((_, i) =>
    liabilitySeries.reduce((sum, s) => sum + s.values[i], 0)
  )
  const datasets: ChartData<'bar'>['datasets'] = [
    {
      label: 'Gross Assets',
      data: grossAssets,
      backgroundColor: wealthColors.assets.emerald + 'aa',
      borderColor: wealthColors.assets.emerald,
      borderWidth: 1,
      stack: 'assets',
    },
  ]
  if (liabilitySeries.length > 0) {
    datasets.push({
      label: 'Liabilities',
      data: totalLiabilities,
      backgroundColor: wealthColors.liabilities.rose + 'aa',
      borderColor: wealthColors.liabilities.rose,
      borderWidth: 1,
      stack: 'liabilities',
    })
  }
  return { labels: data.value.months.map(m => m.slice(0, 7)), datasets }
})

const assetsLiabilitiesOptions = computed((): ChartOptions<'bar'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: t.legend, boxWidth: 10, boxHeight: 10, font: { size: 11 } },
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => `${ctx.dataset.label}: ${eurFmt.format((ctx.parsed as { y: number }).y)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
    },
  }
})

// ── Chart 5: Polar Area – current category spread (3+ non-zero categories) ───
const polarCategories = computed(() => {
  if (!data.value) return []
  return data.value.category_breakdown.filter(r => r.value > 0)
})
const showPolar = computed(() => polarCategories.value.length >= 3)

const polarData = computed((): ChartData<'polarArea'> => {
  const rows = polarCategories.value
  return {
    labels: rows.map(r => r.category_name),
    datasets: [{
      data: rows.map(r => r.value),
      backgroundColor: rows.map(r => r.color + 'cc'),
      borderColor: rows.map(r => r.color),
      borderWidth: 1,
    }],
  }
})

const polarOptions = computed((): ChartOptions<'polarArea'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: t.legend, boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 8 },
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx) => ` ${eurFmt.format(ctx.raw as number)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      r: {
        grid: { color: t.grid },
        ticks: { color: t.tick, font: { size: 10 }, backdropColor: 'transparent', callback: (v) => compactFmt.format(v as number) },
      },
    },
  }
})

// ── Chart 6: Mixed – Net Worth bars + Cash Inflow or Gross Assets line ────────
const hasCashInflowSeries = computed(() =>
  data.value?.series.some(s => s.category_type === 'cash-inflow' && s.values.some(v => v !== 0)) ?? false
)

const mixedData = computed((): { labels: string[]; datasets: MixedDataset[] } => {
  if (!data.value) return { labels: [], datasets: [] }
  const t = getChartTokens(theme.value === 'dark')
  const labels = data.value.months.map(m => m.slice(0, 7))

  const netWorth = data.value.totals
  const cashInflowSeries = data.value.series.filter(s => s.category_type === 'cash-inflow')
  const cashInflow = data.value.months.map((_, i) =>
    cashInflowSeries.reduce((sum, s) => sum + s.values[i], 0)
  )

  const overlayLabel = hasCashInflowSeries.value ? 'Cash Inflow' : 'Gross Assets'
  const overlayData = hasCashInflowSeries.value
    ? cashInflow
    : data.value.months.map((_, i) =>
        data.value!.series.filter(s => s.category_type === 'asset').reduce((sum, s) => sum + s.values[i], 0)
      )
  const overlayColor = hasCashInflowSeries.value
    ? wealthColors.cashInflow.green
    : wealthColors.assets.emerald

  return {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Net Worth',
        data: netWorth,
        backgroundColor: t.totalLine + '66',
        borderColor: t.totalLine,
        borderWidth: 1,
        order: 2,
      },
      {
        type: 'line' as const,
        label: overlayLabel,
        data: overlayData,
        borderColor: overlayColor,
        backgroundColor: overlayColor + '22',
        fill: false,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 3,
        order: 1,
      },
    ] as MixedDataset[],
  }
})

const mixedOptions = computed((): ChartOptions<'bar'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: t.legend, boxWidth: 10, boxHeight: 10, font: { size: 11 } },
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => `${ctx.dataset.label}: ${eurFmt.format((ctx.parsed as { y: number }).y)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
    },
  }
})

// ── Chart 7: Radar – Financial Profile ───────────────────────────────────────
const showRadar = computed(() =>
  (data.value?.category_breakdown.filter(r => r.value !== 0).length ?? 0) >= 2
)

const radarData = computed((): ChartData<'radar'> => {
  if (!data.value) return { labels: [], datasets: [{ data: [] }] }
  const t = getChartTokens(theme.value === 'dark')

  const buckets: Record<string, number> = {
    liquidity: 0, growth: 0, real_estate: 0, crypto: 0, other: 0, inflow: 0, debt: 0,
  }

  for (const row of data.value.category_breakdown) {
    if (row.value === 0) continue
    const key = classifyCategory(row.category_name, row.category_type)
    buckets[key] = (buckets[key] ?? 0) + Math.abs(row.value)
  }

  const total = Object.values(buckets).reduce((a, b) => a + b, 0)
  if (total === 0) return { labels: [], datasets: [{ data: [] }] }

  const values = RADAR_DIMS.map(d => Math.round((buckets[d.key] / total) * 100))

  return {
    labels: RADAR_DIMS.map(d => d.label),
    datasets: [{
      label: 'Portfolio Profile',
      data: values,
      backgroundColor: t.radarFill,
      borderColor: t.radarBorder,
      borderWidth: 2,
      pointBackgroundColor: t.radarBorder,
      pointBorderColor: t.tooltipBg,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: t.radarBorder,
    }],
  }
})

const radarOptions = computed((): ChartOptions<'radar'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx) => ` ${ctx.raw as number}%`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      r: {
        min: 0,
        max: 100,
        grid: { color: t.grid },
        angleLines: { color: t.grid },
        pointLabels: { color: t.legend, font: { size: 11 } },
        ticks: {
          color: t.tick,
          font: { size: 9 },
          backdropColor: 'transparent',
          stepSize: 25,
          callback: (v) => `${v}%`,
        },
      },
    },
  }
})

// ── Chart 8: Scatter – Category current value vs period change ─────────────────
const showScatter = computed(() =>
  (data.value?.category_breakdown.filter(r => r.value !== 0).length ?? 0) >= 2
)

const scatterChartData = computed((): ChartData<'scatter'> => {
  if (!data.value) return { datasets: [] }

  const datasets = data.value.category_breakdown
    .filter(r => r.value !== 0)
    .map(row => {
      const series = data.value!.series.find(s => s.category_id === row.category_id)
      const nonZero = (series?.values ?? []).filter(v => v !== 0)
      const periodChange = nonZero.length >= 2 ? nonZero[nonZero.length - 1] - nonZero[0] : 0

      return {
        label: row.category_name,
        data: [{ x: Math.abs(row.value), y: periodChange }] as ScatterDataPoint[],
        backgroundColor: row.color + 'cc',
        borderColor: row.color,
        pointRadius: 10,
        pointHoverRadius: 12,
        borderWidth: 2,
      }
    })

  return { datasets }
})

const scatterOptions = computed((): ChartOptions<'scatter'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          title: (items) => items[0]?.dataset.label ?? '',
          label: (ctx) => {
            const p = ctx.parsed as { x: number; y: number }
            return [
              ` Value: ${eurFmt.format(p.x)}`,
              ` Period Δ: ${signedEur(p.y)}`,
            ]
          },
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        title: { display: true, text: 'Current Value', color: t.tick, font: { size: 11 } },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        title: { display: true, text: 'Period Change', color: t.tick, font: { size: 11 } },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
    },
  }
})

// ── Chart 9: Bubble – current value × monthly delta × category magnitude ──────
const showBubble = computed(() =>
  (data.value?.category_breakdown.filter(r => r.value !== 0).length ?? 0) >= 2
)

const bubbleChartData = computed((): ChartData<'bubble'> => {
  if (!data.value) return { datasets: [] }

  const activeRows = data.value.category_breakdown.filter(r => r.value !== 0)
  const maxAbs = Math.max(...activeRows.map(r => Math.abs(r.value)), 1)

  const datasets = activeRows.map(row => {
    const series = data.value!.series.find(s => s.category_id === row.category_id)
    const vals = series?.values ?? []
    const last = vals[vals.length - 1] ?? 0
    const prev = vals.length >= 2 ? vals[vals.length - 2] : last
    const monthlyDelta = last - prev

    const r = Math.max(8, Math.round((Math.abs(row.value) / maxAbs) * 34))

    return {
      label: row.category_name,
      data: [{ x: Math.abs(row.value), y: monthlyDelta, r }] as BubbleDataPoint[],
      backgroundColor: row.color + 'aa',
      borderColor: row.color,
      borderWidth: 1.5,
    }
  })

  return { datasets }
})

const bubbleOptions = computed((): ChartOptions<'bubble'> => {
  const t = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          title: (items) => items[0]?.dataset.label ?? '',
          label: (ctx) => {
            const p = ctx.parsed as { x: number; y: number }
            return [
              ` Value: ${eurFmt.format(p.x)}`,
              ` Monthly Δ: ${signedEur(p.y)}`,
            ]
          },
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        title: { display: true, text: 'Current Value', color: t.tick, font: { size: 11 } },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        title: { display: true, text: 'Monthly Δ', color: t.tick, font: { size: 11 } },
        ticks: { color: t.tick, font: { size: 11 }, callback: (v) => compactFmt.format(v as number) },
      },
    },
  }
})

// ── Metric summary ─────────────────────────────────────────────────────────────
function deltaClass(v: number) {
  return v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}
function signedEur(v: number) {
  return (v >= 0 ? '+' : '\u2212') + eurFmt.format(Math.abs(v))
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">
      <!-- Controls -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <SelectButton v-model="range" :options="RANGES" option-label="label" option-value="value" aria-label="Chart time range" class="whitespace-nowrap wt-touch-select wt-soft-select wt-range-select" />
        </div>
      </div>
      <div v-if="persons.length > 0" class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
        <SelectButton v-model="personValue" :options="personOptions" option-label="label" option-value="value" aria-label="Filter by person" class="whitespace-nowrap wt-touch-select wt-soft-select wt-person-select" />
      </div>

      <!-- Errors / warnings -->
      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load analytics data.</Message>
        <div class="mt-2">
          <Button label="Retry" link @click="retryCount++" />
        </div>
      </div>
      <div v-if="personsError" class="mb-3">
        <Message severity="warn" class="w-full text-sm">Person filter unavailable: {{ personsError }}</Message>
      </div>

      <!-- Loading -->
      <template v-if="loading">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Skeleton v-for="i in 4" :key="i" height="72px" border-radius="8px" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Skeleton height="320px" border-radius="8px" />
          <Skeleton height="320px" border-radius="8px" />
        </div>
        <Skeleton height="320px" border-radius="8px" class="mb-4" />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Skeleton height="320px" border-radius="8px" />
          <Skeleton height="320px" border-radius="8px" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Skeleton height="320px" border-radius="8px" />
          <Skeleton height="320px" border-radius="8px" />
        </div>
      </template>

      <template v-else-if="data">
        <!-- Metric cards row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Net Worth</p>
            <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{{ eurFmt.format(data.current_total) }}</p>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Gross Assets</p>
            <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{{ eurFmt.format(data.gross_assets) }}</p>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Period Change</p>
            <p :class="['text-lg font-bold tabular-nums', deltaClass(data.period_delta_abs)]">{{ signedEur(data.period_delta_abs) }}</p>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 shadow-sm">
            <p class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Monthly Change</p>
            <p :class="['text-lg font-bold tabular-nums', deltaClass(data.monthly_delta_abs)]">
              {{ data.months.length >= 2 ? signedEur(data.monthly_delta_abs) : '—' }}
            </p>
          </div>
        </div>

        <!-- Row 1: Net Worth Trend + Allocation Doughnut -->
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Net Worth Trend</h2>
            <div class="h-[280px]">
              <Line :data="(trendData as ChartData<'line'>)" :options="(trendOptions as ChartOptions<'line'>)" />
            </div>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Asset Allocation</h2>
            <div class="h-[280px]">
              <Doughnut
                v-if="allocationData.datasets[0]?.data?.length"
                :data="(allocationData as ChartData<'doughnut'>)"
                :options="(doughnutOptions as ChartOptions<'doughnut'>)"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-sm">No asset data</div>
            </div>
          </div>
        </div>

        <!-- Row 2: Top Contributors + Assets vs Liabilities -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                Top {{ contributorMode === 'categories' ? 'Category' : contributorMode === 'assets' ? 'Asset' : 'Person' }} Contributors
              </h2>
              <SelectButton
                v-model="contributorMode"
                :options="contributorModes"
                option-label="label"
                option-value="value"
                aria-label="Contributor grouping"
                class="whitespace-nowrap wt-touch-select wt-soft-select"
              />
            </div>
            <div class="h-[280px]">
              <Bar
                v-if="topContributorsData.labels?.length"
                :data="(topContributorsData as ChartData<'bar'>)"
                :options="(horizontalBarOptions as ChartOptions<'bar'>)"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-sm">No data</div>
            </div>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              {{ hasLiabilitySeries ? 'Assets vs Liabilities Over Time' : 'Gross Assets Over Time' }}
            </h2>
            <div class="h-[280px]">
              <Bar :data="(assetsVsLiabilitiesData as ChartData<'bar'>)" :options="(assetsLiabilitiesOptions as ChartOptions<'bar'>)" />
            </div>
          </div>
        </div>

        <!-- Row 3: Polar Area (conditional on 3+ categories) + Category Drilldown -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Current Value Distribution (Polar Area)</h2>
            <div class="h-[300px]">
              <PolarArea
                v-if="showPolar"
                :data="(polarData as ChartData<'polarArea'>)"
                :options="(polarOptions as ChartOptions<'polarArea'>)"
              />
              <div v-else class="flex h-full items-center justify-center text-sm text-gray-400 dark:text-zinc-500">
                Not enough category data
              </div>
            </div>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <div class="mb-3">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    {{ drilldownType === 'liability' ? 'Liability' : drilldownType === 'cash-inflow' ? 'Cash Inflow' : 'Asset' }} Drilldown
                  </h2>
                  <p class="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                    Pick a category to see the individual {{ drilldownTypeLabel(drilldownType) }} behind it.
                  </p>
                </div>
                <SelectButton
                  v-model="drilldownType"
                  :options="drilldownTypeOptions"
                  option-label="label"
                  option-value="value"
                  aria-label="Drilldown type"
                  class="wt-touch-select wt-soft-select whitespace-nowrap"
                />
              </div>
            </div>

            <div v-if="categoryDrilldownRows.length" class="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-3">
              <div class="flex max-h-[280px] flex-col gap-1 overflow-y-auto pr-1">
                <button
                  v-for="row in categoryDrilldownRows"
                  :key="row.category_id"
                  type="button"
                  :class="[
                    'w-full rounded-lg border-0 bg-transparent px-2 py-2 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 dark:hover:bg-zinc-800 dark:focus-visible:ring-indigo-500/40',
                    activeCategoryId === row.category_id ? 'bg-gray-50 dark:bg-zinc-800' : ''
                  ]"
                  @click="selectCategory(row.category_id)"
                >
                  <span class="flex items-center gap-2">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
                    <span class="min-w-0 flex-1 text-sm font-medium text-gray-700 dark:text-zinc-200">
                      {{ row.category_name }}
                    </span>
                  </span>
                  <span class="mt-1 flex items-center justify-between pl-4 text-xs text-gray-400 dark:text-zinc-500">
                    <span>{{ row.assets.length }} {{ trackedItemLabel(row.category_type, row.assets.length) }}</span>
                    <span class="font-semibold tabular-nums">{{ eurFmt.format(row.value) }}</span>
                  </span>
                </button>
              </div>

              <div v-if="selectedCategoryDrilldown" class="min-w-0 rounded-xl bg-gray-50 p-3 dark:bg-zinc-950/60">
                <div class="mb-3 flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                      {{ selectedCategoryDrilldown.category_name }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-zinc-400">
                      {{ selectedCategoryDrilldown.assets.length }} tracked {{ trackedItemLabel(selectedCategoryDrilldown.category_type, selectedCategoryDrilldown.assets.length) }}
                    </p>
                  </div>
                  <span
                    :class="['rounded px-1.5 py-0.5 text-center text-[11px] font-semibold capitalize', categoryBadgeClass(selectedCategoryDrilldown.category_type)]"
                  >{{ categoryTypeLabel(selectedCategoryDrilldown.category_type) }}</span>
                </div>

                <div class="max-h-[220px] overflow-y-auto">
                  <div
                    v-for="asset in selectedCategoryDrilldown.assets"
                    :key="asset.asset_id"
                    class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-gray-200 py-2 last:border-0 dark:border-zinc-800"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-gray-800 dark:text-zinc-200">{{ asset.asset_name }}</p>
                      <p class="text-xs text-gray-400 dark:text-zinc-500">{{ personName(asset.person_id) }}</p>
                    </div>
                    <div class="text-right">
                      <p
                        class="text-sm font-semibold tabular-nums"
                        :class="asset.category_type === 'liability' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-zinc-100'"
                      >
                        {{ eurFmt.format(asset.value) }}
                      </p>
                      <p
                        class="text-xs tabular-nums"
                        :class="deltaClass(asset.monthly_delta_abs)"
                      >
                        {{ signedEur(asset.monthly_delta_abs) }} mo
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex h-[280px] items-center justify-center text-sm text-gray-400 dark:text-zinc-500">
               No {{ drilldownTypeLabel(drilldownType) }} details for this range.
            </div>
          </div>
        </div>

        <!-- Row 4: Mixed Net Worth Bar+Line + Financial Profile Radar -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Net Worth vs. {{ hasCashInflowSeries ? 'Cash Inflow' : 'Gross Assets' }} (Mixed)
            </h2>
            <div class="h-[280px]">
              <Bar :data="(mixedData as unknown as ChartData<'bar'>)" :options="(mixedOptions as ChartOptions<'bar'>)" />
            </div>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Financial Profile Radar</h2>
            <div class="h-[280px]">
              <Radar
                v-if="showRadar"
                :data="(radarData as ChartData<'radar'>)"
                :options="(radarOptions as ChartOptions<'radar'>)"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-sm">
                Not enough data for radar
              </div>
            </div>
          </div>
        </div>

        <!-- Row 5: Scatter + Bubble (conditional on 2+ categories) -->
        <div v-if="showScatter || showBubble" class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Category Performance Scatter</h2>
            <p class="text-xs text-gray-400 dark:text-zinc-500 mb-3">Current value vs. period change per category</p>
            <div class="h-[280px]">
              <Scatter
                v-if="showScatter"
                :data="(scatterChartData as ChartData<'scatter'>)"
                :options="(scatterOptions as ChartOptions<'scatter'>)"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-sm">
                Not enough data
              </div>
            </div>
          </div>
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 shadow-sm min-w-0">
            <h2 class="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Portfolio Bubble Map</h2>
            <p class="text-xs text-gray-400 dark:text-zinc-500 mb-3">Value × monthly delta; bubble size = relative magnitude</p>
            <div class="h-[280px]">
              <Bubble
                v-if="showBubble"
                :data="(bubbleChartData as ChartData<'bubble'>)"
                :options="(bubbleOptions as ChartOptions<'bubble'>)"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-sm">
                Not enough data
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="data.series.length === 0" class="text-center py-16 text-gray-400 dark:text-zinc-500">
          <p class="text-lg font-medium mb-2">No data available</p>
          <p class="text-sm">Add assets and data points to see analytics.</p>
        </div>
      </template>
    </div>
  </div>
</template>
