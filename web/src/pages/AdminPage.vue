<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import AssetsTab from '../components/admin/AssetsTab.vue'
import CategoriesTab from '../components/admin/CategoriesTab.vue'
import PeopleTab from '../components/admin/PeopleTab.vue'
import ImportDialog from '../components/admin/ImportDialog.vue'
import PageShell from '../components/ui/PageShell.vue'
import { useDataRefresh } from '../composables/useDataRefresh'

const { notifyReferenceDataChanged, notifyDataPointsChanged } = useDataRefresh()

onMounted(() => {
  document.title = 'Admin — WealthTrack'
})

type CreateAction = {
  openCreate: () => void
}

const activeTab = ref('0')
const assetCount = ref(0)
const incomeCount = ref(0)
const liabilityCount = ref(0)
const categoryCount = ref(0)
const peopleCount = ref(0)
const assetTabRef = ref<CreateAction | null>(null)
const incomeTabRef = ref<CreateAction | null>(null)
const liabilityTabRef = ref<CreateAction | null>(null)
const categoriesTabRef = ref<CreateAction | null>(null)
const peopleTabRef = ref<CreateAction | null>(null)

const tabLabels = computed(() => ({
  assets: `Assets (${assetCount.value})`,
  income: `Income (${incomeCount.value})`,
  liabilities: `Liabilities (${liabilityCount.value})`,
  categories: `Categories (${categoryCount.value})`,
  people: `People (${peopleCount.value})`,
}))

const createButtonLabel = computed(() => {
  switch (activeTab.value) {
    case '1':
      return 'Add Liability'
    case '2':
      return 'Add Income'
    case '3':
      return 'Add Category'
    case '4':
      return 'Add Person'
    default:
      return 'Add Asset'
  }
})

async function openCreateDialog() {
  await nextTick()
  const actions: Record<string, CreateAction | null> = {
    '0': assetTabRef.value,
    '1': liabilityTabRef.value,
    '2': incomeTabRef.value,
    '3': categoriesTabRef.value,
    '4': peopleTabRef.value,
  }
  actions[activeTab.value]?.openCreate()
}

function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function exportData(): void {
  downloadFile('/api/v1/export/database', 'database.yaml')
  setTimeout(() => downloadFile('/api/v1/export/datapoints', 'datapoints.csv'), 250)
}

const importDialogVisible = ref(false)

function onImported() {
  notifyReferenceDataChanged()
  notifyDataPointsChanged()
}
</script>

<template>
  <PageShell>
    <ConfirmDialog />
    <div class="overflow-hidden">
      <Tabs v-model:value="activeTab" class="wt-admin-tabs">
        <div class="flex flex-col gap-3 bg-gray-50/70 px-2 py-2 dark:bg-zinc-900/60 lg:flex-row lg:items-center">
          <div class="overflow-x-auto">
            <TabList class="min-w-max">
              <Tab value="0" class="min-h-12">{{ tabLabels.assets }}</Tab>
              <Tab value="1" class="min-h-12">{{ tabLabels.liabilities }}</Tab>
              <Tab value="2" class="min-h-12">{{ tabLabels.income }}</Tab>
              <Tab value="3" class="min-h-12">{{ tabLabels.categories }}</Tab>
              <Tab value="4" class="min-h-12">{{ tabLabels.people }}</Tab>
            </TabList>
          </div>
          <div class="flex flex-wrap justify-end gap-2 lg:ml-auto lg:flex-nowrap">
            <RouterLink
              to="/data-points"
              class="wt-soft-link order-1 lg:order-1"
            >
              History / Corrections
            </RouterLink>
            <Button label="Import" icon="pi pi-upload" severity="secondary" size="small" class="order-3 lg:order-2" @click="importDialogVisible = true" />
            <Button label="Export" icon="pi pi-download" severity="secondary" size="small" class="order-4 lg:order-3" @click="exportData" />
            <Button :label="createButtonLabel" icon="pi pi-plus" size="small" class="order-2 lg:order-4" @click="openCreateDialog" />
          </div>
        </div>
        <TabPanels class="!bg-transparent !p-0">
          <TabPanel value="0" class="!p-4 sm:!p-5"><AssetsTab ref="assetTabRef" category-type="asset" @update:count="assetCount = $event" /></TabPanel>
          <TabPanel value="1" class="!p-4 sm:!p-5"><AssetsTab ref="liabilityTabRef" category-type="liability" @update:count="liabilityCount = $event" /></TabPanel>
          <TabPanel value="2" class="!p-4 sm:!p-5"><AssetsTab ref="incomeTabRef" category-type="cash-inflow" @update:count="incomeCount = $event" /></TabPanel>
          <TabPanel value="3" class="!p-4 sm:!p-5"><CategoriesTab ref="categoriesTabRef" @update:count="categoryCount = $event" /></TabPanel>
          <TabPanel value="4" class="!p-4 sm:!p-5"><PeopleTab ref="peopleTabRef" @update:count="peopleCount = $event" /></TabPanel>
        </TabPanels>
      </Tabs>
    </div>
    <ImportDialog v-model:visible="importDialogVisible" @imported="onImported" />
  </PageShell>
</template>
