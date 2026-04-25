<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getSummary, getPersons, ApiError } from '../api/client'
import type { SummaryResponse, RangeKey, Person } from '../types/index'
import ChartTypeSelector from '../components/ChartTypeSelector.vue'
import WealthChart from '../components/WealthChart.vue'
import SummaryCards from '../components/SummaryCards.vue'
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

const range = ref<RangeKey>('1y')
const persons = ref<Person[]>([])
const person = ref<string | null>(null)
const data = ref<SummaryResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const { chartType, setChartType } = useChartType('dashboard-chart-type')
const hiddenCategories = ref<Set<string>>(new Set())

function toggleCategory(id: string) {
  const next = new Set(hiddenCategories.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  hiddenCategories.value = next
}

onMounted(() => {
  document.title = 'Dashboard — WealthTrack'
  getPersons()
    .then(list => { persons.value = list })
    .catch(() => {})
})

async function loadSummary() {
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

watch([range, person, retryCount], loadSummary, { immediate: true })

const personOptions = computed(() => [
  { label: 'All', value: 'all' },
  ...persons.value.map(p => ({ label: p.name, value: p.id })),
])
const personValue = computed({
  get: () => person.value ?? 'all',
  set: (v: string) => { person.value = v === 'all' ? null : v },
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-zinc-950">
    <div class="px-4 sm:px-6 py-6">
      <!-- Controls row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <SelectButton
            v-model="range"
            :options="RANGES"
            option-label="label"
            option-value="value"
            class="whitespace-nowrap"
          />
        </div>
        <ChartTypeSelector :value="chartType" @change="setChartType" />
      </div>

      <!-- Person filter -->
      <div v-if="persons.length > 0" class="overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
        <SelectButton
          v-model="personValue"
          :options="personOptions"
          option-label="label"
          option-value="value"
          class="whitespace-nowrap"
        />
      </div>

      <div v-if="error" class="mb-4">
        <Message severity="error" class="w-full">Could not load data. Check your connection.</Message>
        <div class="mt-2">
          <Button label="Retry loading data" link @click="retryCount++" />
        </div>
      </div>

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div class="flex flex-col gap-4">
            <Skeleton height="14rem" border-radius="8px" />
            <Skeleton height="8rem" border-radius="8px" />
          </div>
          <Skeleton height="460px" border-radius="8px" />
        </div>
      </template>

      <!-- Main content: sidebar + chart side-by-side -->
      <template v-else-if="data">
        <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
          <SummaryCards
            :data="data"
            :hidden-categories="hiddenCategories"
            :on-toggle-category="toggleCategory"
          />
          <div class="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
            <WealthChart :data="data" :chart-type="chartType" :hidden-categories="hiddenCategories" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
