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
import type { SummaryResponse } from '../types/index'
import type { ChartType } from '../composables/useChartType'
import { useTheme } from '../composables/useTheme'

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

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const compactFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 0 })

const visibleSeries = computed(() =>
  props.data.series.filter(s => !props.hiddenCategories.has(s.category_id))
)

const labels = computed(() => props.data.months.map(m => m.slice(0, 7)))

const showTotal = computed(() => visibleSeries.value.length > 1)

const chartData = computed((): ChartData<'line'> | ChartData<'bar'> => {
  const series = visibleSeries.value
  const isArea = props.chartType === 'area'

  if (props.chartType === 'bar') {
    return {
      labels: labels.value,
      datasets: series.map(s => ({
        label: s.category_name,
        data: s.values,
        backgroundColor: s.color + 'cc',
        borderColor: s.color,
        borderWidth: 1,
        stack: 'wealth',
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
    stack: isArea ? 'wealth' : undefined,
  }))

  if (showTotal.value) {
    const totals = props.data.months.map((_, i) =>
      series.reduce((sum, s) => sum + s.values[i], 0)
    )
    datasets.push({
      label: 'Total',
      data: totals,
      borderColor: theme.value === 'dark' ? '#f4f4f5' : '#111827',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 2,
      stack: undefined,
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
  const tooltipBg    = dark ? '#18181b' : '#ffffff'
  const tooltipTitle = dark ? '#e4e4e7' : '#111827'
  const tooltipBody  = dark ? '#a1a1aa' : '#6b7280'
  const tooltipBorder= dark ? '#3f3f46' : '#e5e7eb'
  const labelColor   = dark ? '#f4f4f5' : '#111827'
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipBody,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: unknown) => a + (b as number), 0)
            const value = ctx.raw as number
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return ` ${fmt.format(value)}  (${pct}%)`
          },
        },
      },
      datalabels: {
        display: (ctx) => {
          const data = ctx.dataset.data as number[]
          const total = data.reduce((a, b) => a + b, 0)
          const value = data[ctx.dataIndex] ?? 0
          return total > 0 && value / total > 0.05
        },
        color: labelColor,
        font: { size: 11, weight: 'bold' },
        formatter: (value: number, ctx) => {
          const label = ctx.chart.data.labels?.[ctx.dataIndex] ?? ''
          const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0)
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
          return `${label}\n${fmt.format(value)}\n${pct}%`
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
  const isBar = props.chartType === 'bar'
  const isArea = props.chartType === 'area'
  const dark = theme.value === 'dark'

  const gridColor    = dark ? '#27272a' : '#e5e7eb'
  const tickColor    = dark ? '#71717a' : '#6b7280'
  const legendColor  = dark ? '#a1a1aa' : '#374151'
  const tooltipBg    = dark ? '#18181b' : '#ffffff'
  const tooltipTitle = dark ? '#e4e4e7' : '#111827'
  const tooltipBody  = dark ? '#a1a1aa' : '#6b7280'
  const tooltipBorder= dark ? '#3f3f46' : '#e5e7eb'

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          font: { size: 12 },
          color: legendColor,
          filter: (item) => item.text !== 'Total',
        },
        onClick: () => {},
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipBody,
        borderColor: tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label: (ctx: TooltipItem<'line'> | TooltipItem<'bar'>) => {
            const y = (ctx.parsed as { y: number }).y
            return `${ctx.dataset.label}: ${fmt.format(y)}`
          },
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 12 } },
      },
      y: {
        stacked: isBar || isArea,
        grid: { color: gridColor },
        ticks: {
          color: tickColor,
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
      :data="(pieData as any)"
      :options="(pieOptions as any)"
    />
    <Bar
      v-else-if="chartType === 'bar'"
      :data="(chartData as any)"
      :options="(chartOptions as any)"
    />
    <Line
      v-else
      :data="(chartData as any)"
      :options="(chartOptions as any)"
    />
  </div>
</template>
