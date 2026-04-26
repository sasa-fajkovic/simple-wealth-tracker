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
  type Plugin,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import type { ProjectionsResponse } from '../types/index'
import { useTheme } from '../composables/useTheme'
import { buildTooltipDefaults, getChartTokens } from '../theme/tokens'
import { eurFmt, compactFmt } from '../utils/formatters'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend, ChartDataLabels,
)

type ProjectionChartType = 'area' | 'line' | 'bar'

/** Marker fields added to each chart.js dataset for legend/tooltip filtering. */
interface ProjDS {
  _hideFromLegend?: boolean
  _projChart?: boolean
  _categoryId?: string
  _phase?: 'historical' | 'projected'
}

const props = withDefaults(defineProps<{
  data: ProjectionsResponse
  chartType: ProjectionChartType
  hiddenCategories?: Set<string>
}>(), {
  hiddenCategories: () => new Set(),
})

const { theme } = useTheme()

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

// When categories are hidden, recompute totals for visible series only.
// This keeps the "Total" line consistent with what's actually shown in the chart.
const adjustedHistTotals = computed(() => {
  if (props.hiddenCategories.size === 0) return props.data.historical.totals
  const len = props.data.historical.months.length
  return Array.from({ length: len }, (_, i) =>
    mergedSeries.value.reduce((sum, s) => sum + (s.histValues[i] ?? 0), 0),
  )
})

const adjustedProjTotals = computed(() => {
  if (props.hiddenCategories.size === 0) return props.data.projection.totals
  const len = props.data.projection.months.length
  return Array.from({ length: len }, (_, i) =>
    mergedSeries.value.reduce((sum, s) => sum + (s.projValues[i] ?? 0), 0),
  )
})

const showTotal = computed(() => mergedSeries.value.length > 1)

// Boundary plugin — draws a vertical dashed line with "Historical ←" / "→ Projected" labels
// at the transition between historical and projected data.
const boundaryPlugin = computed((): Plugin<'line' | 'bar'> => {
  const histLen = props.data.historical.months.length
  const dark = theme.value === 'dark'
  const lineColor  = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'
  const labelColor = dark ? 'rgba(161,161,170,0.85)' : 'rgba(107,114,128,0.85)'

  return {
    id: 'projectionBoundary',
    afterDraw(chart) {
      if (histLen < 1 || props.data.projection.months.length < 1) return
      const { ctx, chartArea, scales } = chart
      const xScale = scales['x']
      if (!xScale) return
      // Draw the boundary between last historical bar and first projected bar
      const leftPx  = xScale.getPixelForValue(histLen - 1)
      const rightPx = xScale.getPixelForValue(histLen)
      const midX = (leftPx + rightPx) / 2

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(midX, chartArea.top)
      ctx.lineTo(midX, chartArea.bottom)
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.restore()

      // Labels just below the top edge of the chart area
      ctx.save()
      ctx.font = '10px ui-sans-serif,system-ui,sans-serif'
      ctx.fillStyle = labelColor
      ctx.textBaseline = 'top'
      const labelY = chartArea.top + 4
      ctx.textAlign = 'right'
      ctx.fillText('Historical', midX - 5, labelY)
      ctx.textAlign = 'left'
      ctx.fillText('Projected', midX + 5, labelY)
      ctx.restore()
    },
  }
})

// Bridge value: last historical value connects to first projected value visually.
// The projected dataset starts one position back (at last hist index) with the bridge.
function buildNullPaddedDatasets(
  isArea: boolean,
  isBar: boolean,
) {
  const projLen = props.data.projection.months.length
  const histLen = props.data.historical.months.length
  const dark = theme.value === 'dark'
  const totalColor = getChartTokens(dark).totalLine

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
        _phase: 'historical',
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
        _phase: 'projected',
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
        stack: isArea ? 'wealth-hist' : undefined,
        _projChart: true,
        _hideFromLegend: false,
        _categoryId: s.category_id,
        _phase: 'historical',
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
        stack: isArea ? 'wealth-proj' : undefined,
        _projChart: true,
        _hideFromLegend: true,
        _categoryId: s.category_id,
        _phase: 'projected',
      })
    }
  }

  // Total line — uses adjusted totals so hidden categories are excluded
  if (showTotal.value) {
    const totalHistData = [...adjustedHistTotals.value, ...Array(projLen).fill(null)]
    const totalBridge = adjustedHistTotals.value[histLen - 1] ?? null
    const totalProjData = [...Array(histLen - 1).fill(null), totalBridge, ...adjustedProjTotals.value]

    const totalBase = {
      type: 'line' as const,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 2,
      _projChart: true,
      _hideFromLegend: true,
    }
    datasets.push({
      ...totalBase,
      label: 'Total',
      data: totalHistData,
      borderColor: totalColor,
      stack: 'total-historical',
      _hideFromLegend: false,
      _phase: 'historical',
    })
    datasets.push({
      ...totalBase,
      label: 'Total (projected)',
      data: totalProjData,
      borderColor: totalColor + 'aa',
      borderDash: [5, 5],
      stack: 'total-projected',
      _hideFromLegend: true,
      _phase: 'projected',
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
  const t = getChartTokens(dark)

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          font: { size: 12 },
          color: t.legend,
          boxWidth: 12,
          boxHeight: 12,
          boxPadding: 4,
          filter: (item: LegendItem, data) => {
            const ds = data.datasets[item.datasetIndex as number] as ProjDS
            return !ds._hideFromLegend
          },
        },
        onClick: () => {},
      },
      tooltip: {
        ...buildTooltipDefaults(t),
        callbacks: {
          label: (ctx: TooltipItem<'line'> | TooltipItem<'bar'>) => {
            const y = (ctx.parsed as { y: number }).y
            if (y === null || y === undefined) return ''
            const ds = ctx.dataset as ProjDS
            const label = String(ctx.dataset.label ?? '').replace(' (projected)', '')
            const phase = ds._phase === 'projected' ? ' projected' : ''
            return `${label}${phase}: ${eurFmt.format(y)}`
          },
        },
        filter: (item: import('chart.js').TooltipItem<'bar' | 'line'>) => {
          const ds = item.dataset as ProjDS
          const histLen = props.data.historical.months.length
          if (ds._phase === 'projected' && item.dataIndex < histLen) return false
          if (ds._phase === 'historical' && item.dataIndex >= histLen) return false
          const y = (item.parsed as { y: number }).y
          return y !== null && y !== undefined
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
        ticks: { color: t.tick, font: { size: 11 }, maxTicksLimit: 12 },
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
  <div class="h-[440px]">
    <Bar
      v-if="chartType === 'bar'"
      :data="(chartData as ChartData<'bar'>)"
      :options="(chartOptions as ChartOptions<'bar'>)"
      :plugins="[boundaryPlugin]"
    />
    <Line
      v-else
      :data="(chartData as ChartData<'line'>)"
      :options="(chartOptions as ChartOptions<'line'>)"
      :plugins="[boundaryPlugin]"
    />
  </div>
</template>
