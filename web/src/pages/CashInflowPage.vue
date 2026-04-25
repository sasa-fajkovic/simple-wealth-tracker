<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getSummary, getPersons, ApiError } from '../api/client'
import type { SummaryResponse, RangeKey, Person } from '../types/index'
import ChartTypeSelector from '../components/ChartTypeSelector.vue'
import WealthChart from '../components/WealthChart.vue'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { useChartType } from '../composables/useChartType'

const RANGES: { label: string; value: RangeKey }[] = [
  { label: 'YTD', value: 'ytd' }, { label: '6M',  value: '6m'  },
  { label: '1Y',  value: '1y'  }, { label: '2Y',  value: '2y'  },
  { label: '3Y',  value: '3y'  }, { label: '5Y',  value: '5y'  },
  { label: '10Y', value: '10y' }, { label: 'Max', value: 'max' },
]

const range = ref<RangeKey>('10y')
const persons = ref<Person[]>([])
const person = ref<string | null>(null)
const data = ref<SummaryResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const { chartType, setChartType } = useChartType('cashinflow-chart-type')

onMounted(() => {
  document.title = 'Cash Inflow — WealthTrack'
  getPersons().then(list => { persons.value = list }).catch(() => {})
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

watch([range, person, retryCount], loadSummary, { immediate: true })

const personOptions = computed(() => [
  { label: 'All', value: 'all' },
  ...persons.value.map(p => ({ label: p.name, value: p.id })),
])
const personValue = computed({
  get: () => person.value ?? 'all',
  set: (v: string) => { person.value = v === 'all' ? null : v },
})
const isEmpty = computed(() => !loading.value && data.value && data.value.series.length === 0)
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-zinc-100 mb-4">Cash Inflow</h1>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <SelectButton v-model="range" :options="RANGES" option-label="label" option-value="value" class="whitespace-nowrap" />
        </div>
        <ChartTypeSelector :value="chartType" @change="setChartType" />
      </div>

      <div v-if="persons.length > 0" class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
        <SelectButton v-model="personValue" :options="personOptions" option-label="label" option-value="value" class="whitespace-nowrap" />
      </div>

      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load data.</Message>
        <div class="mt-2">
          <Button label="Retry" link @click="retryCount++" />
        </div>
      </div>

      <Skeleton v-if="loading" height="420px" border-radius="8px" />

      <div v-else-if="isEmpty" class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
        <div class="text-center py-16 text-gray-400 dark:text-zinc-500">
          <p class="text-lg font-medium mb-2">No cash inflow data yet</p>
          <p class="text-sm">Create a category marked as <strong>Cash Inflow tracking only</strong> in Admin, then add data points for it.</p>
        </div>
      </div>

      <div v-else-if="data" class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
        <WealthChart :data="data" :chart-type="chartType" />
      </div>
    </div>
  </div>
</template>
