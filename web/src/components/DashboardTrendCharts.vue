<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
  type Chart,
  type ChartEvent,
  type ActiveElement,
} from 'chart.js'
import type { SummaryResponse } from '../types/index'
import { useTheme } from '../composables/useTheme'
import { buildTooltipDefaults, getChartTokens, wealthColors } from '../theme/tokens'
import { compactFmt, eurFmt } from '../utils/formatters'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

type TrendType = SummaryResponse['series'][number]['category_type']

const props = defineProps<{
  data: SummaryResponse
  cashInflowData: SummaryResponse
}>()

type CardKind = 'netWorth' | 'assets' | 'liabilities' | 'income'

const emit = defineEmits<{
  'point-click': [payload: { kind: CardKind; monthIndex: number; month: string }]
}>()

function setHoverCursor(event: ChartEvent, elements: ActiveElement[]) {
  const native = event.native as Event | undefined
  const target = (native?.target ?? null) as HTMLElement | null
  if (target && 'style' in target) {
    target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
  }
}

function makeClickHandler(kind: CardKind, labelsRef: () => string[]) {
  return (event: ChartEvent, _elements: ActiveElement[], chart: Chart) => {
    const native = event.native as Event | undefined
    if (!native) return
    const hits = chart.getElementsAtEventForMode(native, 'nearest', { intersect: true }, true)
    if (hits.length === 0) return
    const monthIndex = hits[0].index
    const labels = labelsRef()
    const month = labels[monthIndex]
    if (!month) return
    emit('point-click', { kind, monthIndex, month })
  }
}

const { theme } = useTheme()

const labels = computed(() => props.data.months.map(month => month.slice(0, 7)))

function valuesForType(summary: SummaryResponse, type: TrendType): number[] {
  return summary.months.map((_, index) =>
    summary.series
      .filter(series => series.category_type === type)
      .reduce((sum, series) => sum + (series.values[index] ?? 0), 0)
  )
}

function latestValue(values: number[]): number {
  return values.length > 0 ? values[values.length - 1] : 0
}

function trendChartData(label: string, chartLabels: string[], values: number[], color: string): ChartData<'line'> {
  return {
    labels: chartLabels,
    datasets: [{
      label,
      data: values,
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 3,
    }],
  }
}

const assetValues = computed(() => valuesForType(props.data, 'asset'))
const liabilityValues = computed(() => valuesForType(props.data, 'liability'))
const cashInflowValues = computed(() => valuesForType(props.cashInflowData, 'cash-inflow'))
const cashInflowLabels = computed(() => props.cashInflowData.months.map(month => month.slice(0, 7)))
const netWorthData = computed((): ChartData<'line'> => {
  const tokens = getChartTokens(theme.value === 'dark')
  return {
    labels: labels.value,
    datasets: [{
      label: 'Net Worth',
      data: props.data.totals,
      borderColor: tokens.totalLine,
      backgroundColor: tokens.totalLine + '33',
      fill: true,
      tension: 0.2,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 3,
    }],
  }
})

const cards = computed(() => [
  {
    title: 'Assets Trend',
    subtitle: 'Total asset value over time',
    valueClass: 'text-emerald-600 dark:text-emerald-400',
    currentValue: latestValue(assetValues.value),
    hasData: assetValues.value.length > 0,
    data: trendChartData('Assets', labels.value, assetValues.value, wealthColors.assets.emerald),
    kind: 'assets' as CardKind,
    labelsRef: () => labels.value,
  },
  {
    title: 'Liabilities Trend',
    subtitle: 'Total debt balance over time',
    valueClass: 'text-red-600 dark:text-red-400',
    currentValue: latestValue(liabilityValues.value),
    hasData: liabilityValues.value.length > 0,
    data: trendChartData('Liabilities', labels.value, liabilityValues.value, wealthColors.liabilities.rose),
    kind: 'liabilities' as CardKind,
    labelsRef: () => labels.value,
  },
  {
    title: 'Income Trend',
    subtitle: 'Income over time',
    valueClass: 'text-teal-600 dark:text-teal-400',
    currentValue: latestValue(cashInflowValues.value),
    hasData: cashInflowValues.value.length > 0,
    data: trendChartData('Income', cashInflowLabels.value, cashInflowValues.value, wealthColors.cashInflow.teal),
    kind: 'income' as CardKind,
    labelsRef: () => cashInflowLabels.value,
  },
])

function buildChartOptions(kind: CardKind, labelsRef: () => string[]): ChartOptions<'line'> {
  const tokens = getChartTokens(theme.value === 'dark')
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onHover: setHoverCursor,
    onClick: makeClickHandler(kind, labelsRef),
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipDefaults(tokens),
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => ` ${eurFmt.format((ctx.parsed as { y: number }).y)}`,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: tokens.grid },
        border: { display: false },
        ticks: { color: tokens.tick, font: { size: 11 }, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: tokens.grid },
        border: { display: false },
        ticks: { color: tokens.tick, font: { size: 11 }, callback: (value) => compactFmt.format(value as number) },
      },
    },
  }
}

const netWorthChartOptions = computed((): ChartOptions<'line'> => buildChartOptions('netWorth', () => labels.value))
const assetsChartOptions = computed((): ChartOptions<'line'> => buildChartOptions('assets', () => labels.value))
const liabilitiesChartOptions = computed((): ChartOptions<'line'> => buildChartOptions('liabilities', () => labels.value))
const incomeChartOptions = computed((): ChartOptions<'line'> => buildChartOptions('income', () => cashInflowLabels.value))

const cardOptionsByKind = computed<Record<CardKind, ChartOptions<'line'>>>(() => ({
  netWorth: netWorthChartOptions.value,
  assets: assetsChartOptions.value,
  liabilities: liabilitiesChartOptions.value,
  income: incomeChartOptions.value,
}))
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h2 class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Net Worth Trend</h2>
      <div class="h-[280px]">
        <Line
          :data="netWorthData"
          :options="netWorthChartOptions"
        />
      </div>
    </section>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section
        v-for="card in cards"
        :key="card.title"
        class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">{{ card.title }}</h2>
            <p class="mt-1 text-xs text-gray-400 dark:text-zinc-500">{{ card.subtitle }}</p>
          </div>
          <p :class="['shrink-0 text-sm font-bold tabular-nums', card.valueClass]">
            {{ eurFmt.format(card.currentValue) }}
          </p>
        </div>
        <div class="h-[320px]">
          <Line
            v-if="card.hasData"
            :data="card.data"
            :options="cardOptionsByKind[card.kind]"
          />
          <div v-else class="flex h-full items-center justify-center text-sm text-gray-400 dark:text-zinc-500">
            No data yet
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
