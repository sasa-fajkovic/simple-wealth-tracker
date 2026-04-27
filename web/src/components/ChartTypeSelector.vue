<script setup lang="ts">
import { AreaChart, LineChart, BarChart2, PieChart } from 'lucide-vue-next'
import SelectButton from 'primevue/selectbutton'
import type { ChartType } from '../composables/useChartType'

const props = defineProps<{
  value: ChartType
}>()

const emit = defineEmits<{
  change: [value: ChartType]
}>()

const options = [
  { label: 'Trend',        value: 'trend' as ChartType },
  { label: 'Stacked Area', value: 'area' as ChartType },
  { label: 'Line',         value: 'line' as ChartType },
  { label: 'Stacked Bar',  value: 'bar'  as ChartType },
  { label: 'Pie',          value: 'pie'  as ChartType },
]

function handleChange(v: ChartType | null) {
  if (v != null) emit('change', v)
}

function shortLabel(value: ChartType): string {
  if (value === 'area') return 'Area'
  if (value === 'bar') return 'Bar'
  return options.find(option => option.value === value)?.label ?? value
}
</script>

<template>
  <div class="wt-control-strip max-w-full" v-active-scroll>
    <SelectButton
      :model-value="props.value"
      :options="options"
      option-label="label"
      option-value="value"
      aria-label="Chart type"
      class="wt-touch-select wt-soft-select wt-chart-type-select"
      @update:model-value="handleChange"
    >
      <template #option="slotProps">
        <span :title="slotProps.option.label" class="flex items-center justify-center gap-1.5">
          <LineChart  v-if="slotProps.option.value === 'trend'" :size="16" />
          <AreaChart  v-else-if="slotProps.option.value === 'area'" :size="16" />
          <LineChart  v-else-if="slotProps.option.value === 'line'" :size="16" />
          <BarChart2  v-else-if="slotProps.option.value === 'bar'"  :size="16" />
          <PieChart   v-else                                        :size="16" />
          <span class="text-xs">{{ shortLabel(slotProps.option.value) }}</span>
        </span>
      </template>
    </SelectButton>
  </div>
</template>
