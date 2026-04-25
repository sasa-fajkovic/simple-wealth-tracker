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
  { label: 'Stacked Area', value: 'area' as ChartType },
  { label: 'Line',         value: 'line' as ChartType },
  { label: 'Stacked Bar',  value: 'bar'  as ChartType },
  { label: 'Pie',          value: 'pie'  as ChartType },
]

function handleChange(v: ChartType | null) {
  if (v != null) emit('change', v)
}
</script>

<template>
  <SelectButton
    :model-value="props.value"
    :options="options"
    option-label="label"
    option-value="value"
    @update:model-value="handleChange"
  >
    <template #option="slotProps">
      <span :title="slotProps.option.label" class="flex items-center justify-center">
        <AreaChart  v-if="slotProps.option.value === 'area'" :size="16" />
        <LineChart  v-else-if="slotProps.option.value === 'line'" :size="16" />
        <BarChart2  v-else-if="slotProps.option.value === 'bar'"  :size="16" />
        <PieChart   v-else                                        :size="16" />
      </span>
    </template>
  </SelectButton>
</template>
