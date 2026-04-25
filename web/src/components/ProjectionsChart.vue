<script setup lang="ts">
import { computed } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
  type LegendItem,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import type { ProjectionsResponse } from '../types/index'
import { useTheme } from '../composables/useTheme'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend, ChartDataLabels,
)

type ProjectionChartType = 'area' | 'line' | 'bar'

const props = withDefaults(defineProps<{
  data: ProjectionsResponse
  chartType: ProjectionChartType
  hiddenCategories?: Set<string>
}>(), {
  hiddenCategories: () => new Set(),
})

const { theme } = useTheme()

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const compactFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 0 })

// All months combined: historical + projection
const allMonths = computed(() => [
  ...props.data.historical.months,
  ...props.data.projection.months,
])

// Merge historical+projected series, filtering hidden categories
const mergedSeries = computed(() => {
  const hist = props.data.historical.series.filter(
    s => !props.hiddenCategories.has(s.category_id),
  )
  const proj = props.data.projection.series
  return hist.map(hs => {
    const ps = proj.find(p => p.category_id === hs.category_id)
    return {
      category_id: hs.category_id,
      category_name: hs.category_name,
      color: hs.color,
      histValues: hs.values,
      projValues: ps?.values ?? Array(props.data.projection.months.length).fill(0),
    }
  })
})

const showTotal = computed(() => mergedSeries.value.length > 1)

// Bridge value: last historical value connects to first projected value visually.
// The projected dataset starts one position back (at last hist index) with the bridge.
function buildNullPaddedDatasets(
  isArea: boolean,
  isBar: boolean,
) {
  const projLen = props.data.projection.months.length
  const histLen = props.data.historical.months.length
  const dark = theme.value === 'dark'
  const totalColor = dark ? '#f4f4f5' : '#111827'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = []

  for (const s of mergedSeries.value) {
    // Historical dataset: actual values then nulls
    const histPad = Array(projLen).fill(null)
    const histData = [...s.histValues, ...histPad]

    // Projected dataset: nulls for history (except bridge), then projected values
    // Bridge: last historical value repeated at boundary for visual continuity
    const bridgeNulls = Array(histLen - 1).fill(null)
    const bridge = s.histValues[histLen - 1] ?? null
    const projData = [...bridgeNulls, bridge, ...s.projValues]

    if (isBar) {
      datasets.push({
        label: s.category_name,
        data: histData,
        backgroundColor: s.color + 'cc',
        borderColor: s.color,
        borderWidth: 1,
        stack: 'wealth',
        _projChart: true,
        _hideFromLegend: false,
        _categoryId: s.category_id,
      })
      datasets.push({
        label: s.category_name,
        data: projData,
        backgroundColor: s.color + '55',
        borderColor: s.color + '88',
        borderWidth: 1,
        borderDash: [4, 4],
        stack: 'wealth',
        _projChart: true,
        _hideFromLegend: true,
        _categoryId: s.category_id,
      })
    } else {
      // line / area
      datasets.push({
        label: s.category_name,
        data: histData,
        borderColor: s.color,
        backgroundColor: isArea ? s.color + '99' : s.color,
        fill: isArea ? 'stack' : false,
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2,
        stack: isArea ? 'wealth' : undefined,
        _projChart: true,
        _hideFromLegend: false,
        _categoryId: s.category_id,
      })
      datasets.push({
        label: s.category_name,
        data: projData,
        borderColor: s.color + 'aa',
        backgroundColor: isArea ? s.color + '44' : s.color,
        fill: isArea ? 'stack' : false,
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [5, 5],
        stack: isArea ? 'wealth' : undefined,
        _projChart: true,
        _hideFromLegend: true,
        _categoryId: s.category_id,
      })
    }
  }

  // Total line
  if (showTotal.value) {
    const totalHistData = [...props.data.historical.totals, ...Array(projLen).fill(null)]
    const totalBridge = props.data.historical.totals[histLen - 1] ?? null
    const totalProjData = [...Array(histLen - 1).fill(null), totalBridge, ...props.data.projection.totals]

    const totalBase = {
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 2,
      stack: undefined,
      _projChart: true,
      _hideFromLegend: true,
    }
    datasets.push({
      ...totalBase,
      label: 'Total',
      data: totalHistData,
      borderColor: totalColor,
      _hideFromLegend: false,
    })
    datasets.push({
      ...totalBase,
      label: 'Total (projected)',
      data: totalProjData,
      borderColor: totalColor + 'aa',
      borderDash: [5, 5],
      _hideFromLegend: true,
    })
  }

  return datasets
}

const chartData = computed((): ChartData<'line'> | ChartData<'bar'> => {
  const isArea = props.chartType === 'area'
  const isBar = props.chartType === 'bar'
  return {
    labels: allMonths.value,
    datasets: buildNullPaddedDatasets(isArea, isBar),
  } as ChartData<'line'> | ChartData<'bar'>
})

const chartOptions = computed((): ChartOptions<'line'> | ChartOptions<'bar'> => {
  const isBar = props.chartType === 'bar'
  const isArea = props.chartType === 'area'
  const dark = theme.value === 'dark'

  const gridColor     = dark ? '#27272a' : '#e5e7eb'
  const tickColor     = dark ? '#71717a' : '#6b7280'
  const legendColor   = dark ? '#a1a1aa' : '#374151'
  const tooltipBg     = dark ? '#18181b' : '#ffffff'
  const tooltipTitle  = dark ? '#e4e4e7' : '#111827'
  const tooltipBody   = dark ? '#a1a1aa' : '#6b7280'
  const tooltipBorder = dark ? '#3f3f46' : '#e5e7eb'

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          font: { size: 12 },
          color: legendColor,
          filter: (item: LegendItem, data) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ds = data.datasets[item.datasetIndex as number] as any
            return !ds._hideFromLegend
          },
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
            if (y === null || y === undefined) return ''
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ds = ctx.dataset as any
            if (ds._hideFromLegend) return ''
            return `${ctx.dataset.label}: ${fmt.format(y)}`
          },
        },
        filter: (item: import('chart.js').TooltipItem<'bar' | 'line'>) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ds = item.dataset as any
          if (ds._hideFromLegend) return false
          const y = (item.parsed as { y: number }).y
          return y !== null && y !== undefined
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 11 }, maxTicksLimit: 12 },
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
  <div class="h-[440px]">
    <Bar
      v-if="chartType === 'bar'"
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
