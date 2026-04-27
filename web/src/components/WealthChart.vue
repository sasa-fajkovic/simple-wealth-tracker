<script setup lang="ts">
import { computed } from 'vue'
import { Line, Bar, Pie } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import type { Context as DatalabelsContext } from 'chartjs-plugin-datalabels'
import type { SummaryResponse } from '../types/index'
import type { ChartType } from '../composables/useChartType'
import { useTheme } from '../composables/useTheme'
import { buildTooltipDefaults, getChartTokens } from '../theme/tokens'
import { eurFmt, compactFmt } from '../utils/formatters'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  ChartDataLabels,
)

const props = withDefaults(defineProps<{
  data: SummaryResponse
  chartType: ChartType
  hiddenCategories?: Set<string>
}>(), {
  hiddenCategories: () => new Set(),
})

const { theme } = useTheme()

const visibleSeries = computed(() =>
  props.data.series.filter(s => !props.hiddenCategories.has(s.category_id))
)

const labels = computed(() => props.data.months.map(m => m.slice(0, 7)))

const showTotal = computed(() => visibleSeries.value.length > 1)
const displayedTotals = computed(() =>
  props.data.months.map((_, i) =>
    visibleSeries.value.reduce((sum, s) => sum + s.values[i], 0)
  )
)
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').slice(0, 6)
  if (!/^[\da-f]{6}$/i.test(normalized)) return null
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const toLinear = (channel: number) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
}

function sliceColor(ctx: DatalabelsContext): string {
  const colors = ctx.dataset.backgroundColor
  if (Array.isArray(colors)) return String(colors[ctx.dataIndex] ?? '#64748b')
  return typeof colors === 'string' ? colors : '#64748b'
}

function readablePieTextColor(ctx: DatalabelsContext): string {
  return relativeLuminance(sliceColor(ctx)) > 0.48 ? '#111827' : '#ffffff'
}

function pieTextStrokeColor(ctx: DatalabelsContext): string {
  return readablePieTextColor(ctx) === '#ffffff' ? 'rgba(17, 24, 39, 0.45)' : 'rgba(255, 255, 255, 0.55)'
}

const chartData = computed((): ChartData<'line'> | ChartData<'bar'> => {
  const series = visibleSeries.value
  const isTrend = props.chartType === 'trend'
  const isArea = props.chartType === 'area'

  if (isTrend) {
    const tokens = getChartTokens(theme.value === 'dark')
    const color = tokens.totalLine
    return {
      labels: labels.value,
      datasets: [{
        label: 'Total Income',
        data: displayedTotals.value,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 3,
      }],
    } as ChartData<'line'>
  }

  if (props.chartType === 'bar') {
    return {
      labels: labels.value,
      datasets: series.map(s => ({
        label: s.category_name,
        data: s.values,
        backgroundColor: s.color + 'cc',
        borderColor: s.color,
        borderWidth: 1,
        // Separate stacks so liabilities go below zero and assets stack above
        stack: s.category_type === 'liability' ? 'liabilities' : 'assets',
      })),
    } as ChartData<'bar'>
  }

  const datasets: ChartData<'line'>['datasets'] = series.map(s => ({
    label: s.category_name,
    data: s.values,
    borderColor: s.color,
    backgroundColor: isArea ? s.color + '99' : s.color,
    fill: isArea,
    tension: 0.1,
    pointRadius: 0,
    borderWidth: 2,
    // Liabilities: dashed line for visual distinction
    borderDash: s.category_type === 'liability' ? [5, 4] : undefined,
    stack: isArea ? (s.category_type === 'liability' ? 'liabilities' : 'assets') : undefined,
    order: 1,
  }))

  if (showTotal.value) {
    const t = getChartTokens(theme.value === 'dark')
    datasets.push({
      label: 'Total',
      data: displayedTotals.value,
      borderColor: t.totalLine,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 3,
      stack: undefined,
      order: 0,
    })
  }

  return { labels: labels.value, datasets } as ChartData<'line'>
})

const pieData = computed((): ChartData<'pie'> => {
  const series = visibleSeries.value
  const lastIdx = props.data.months.length - 1
  const values = series.map(s => Math.max(0, s.values[lastIdx] ?? 0))
  return {
    labels: series.map(s => s.category_name),
    datasets: [{
      data: values,
      backgroundColor: series.map(s => s.color + 'cc'),
      borderColor: series.map(s => s.color),
      borderWidth: 2,
    }],
  }
})

const pieOptions = computed((): ChartOptions<'pie'> => {
  const dark = theme.value === 'dark'
  const t = getChartTokens(dark)
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
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
      datalabels: {
        display: (ctx) => {
          const data = ctx.dataset.data as number[]
          const total = data.reduce((a, b) => a + b, 0)
          const value = data[ctx.dataIndex] ?? 0
          return total > 0 && value / total > 0.07
        },
        color: readablePieTextColor,
        textStrokeColor: pieTextStrokeColor,
        textStrokeWidth: 2,
        font: {
          family: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          size: 12,
          weight: 'bold',
          lineHeight: 1.25,
        },
        formatter: (value: number, ctx) => {
          const label = ctx.chart.data.labels?.[ctx.dataIndex] ?? ''
          const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0)
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
          return `${label}\n${pct}%`
        },
        textAlign: 'center',
        anchor: 'center',
        align: 'center',
        clamp: true,
      },
    },
  }
})

const chartOptions = computed((): ChartOptions<'line'> | ChartOptions<'bar'> => {
  const isTrend = props.chartType === 'trend'
  const isBar = props.chartType === 'bar'
  const isArea = props.chartType === 'area'
  const dark = theme.value === 'dark'
  const t = getChartTokens(dark)

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: !isTrend,
        labels: {
          font: { size: 12 },
          color: t.legend,
          boxWidth: 12,
          boxHeight: 12,
          boxPadding: 4,
          filter: (item) => item.text !== 'Total',
        },
        onClick: () => {},
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'line'> | TooltipItem<'bar'>) => {
            const y = (ctx.parsed as { y: number }).y
            return isTrend ? ` ${eurFmt.format(y)}` : `${ctx.dataset.label}: ${eurFmt.format(y)}`
          },
        },
      },
      datalabels: { display: false },
    },
    datasets: {
      line: {
        pointHoverRadius: 4,
      },
    },
    scales: {
      x: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { color: t.tick, font: { size: 12 } },
      },
      y: {
        stacked: isBar || isArea,
        grid: { color: t.grid },
        border: { display: false },
        ticks: {
          color: t.tick,
          font: { size: 12 },
          callback: (value) => compactFmt.format(value as number),
        },
      },
    },
  } as ChartOptions<'line'> | ChartOptions<'bar'>
})
</script>

<template>
  <div class="h-[420px]">
    <Pie
      v-if="chartType === 'pie'"
      :data="(pieData as ChartData<'pie'>)"
      :options="(pieOptions as ChartOptions<'pie'>)"
    />
    <Bar
      v-else-if="chartType === 'bar'"
      :data="(chartData as ChartData<'bar'>)"
      :options="(chartOptions as ChartOptions<'bar'>)"
    />
    <Line
      v-else
      :data="(chartData as ChartData<'line'>)"
      :options="(chartOptions as ChartOptions<'line'>)"
    />
  </div>
</template>
