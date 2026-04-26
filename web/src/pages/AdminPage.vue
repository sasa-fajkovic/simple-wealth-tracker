<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import AssetsTab from '../components/admin/AssetsTab.vue'
import CategoriesTab from '../components/admin/CategoriesTab.vue'
import PeopleTab from '../components/admin/PeopleTab.vue'
import PageShell from '../components/ui/PageShell.vue'

onMounted(() => {
  document.title = 'Admin — WealthTrack'
})
</script>

<template>
  <PageShell>
    <ConfirmDialog />
    <div class="mb-6 flex flex-wrap items-start gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Setup</p>
        <p class="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Manage people, categories, assets, cash inflow sources, and liabilities.
        </p>
      </div>
      <RouterLink
        to="/history"
        class="wt-soft-link ml-auto"
      >
        History / Corrections
      </RouterLink>
    </div>
    <div class="overflow-hidden">
      <Tabs value="0" class="wt-admin-tabs">
        <div class="overflow-x-auto bg-gray-50/70 px-2 dark:bg-zinc-900/60">
          <TabList class="min-w-max">
            <Tab value="0" class="min-h-12">Assets</Tab>
            <Tab value="1" class="min-h-12">Cash Inflow</Tab>
            <Tab value="2" class="min-h-12">Liabilities</Tab>
            <Tab value="3" class="min-h-12">Categories</Tab>
            <Tab value="4" class="min-h-12">People</Tab>
          </TabList>
        </div>
        <TabPanels class="!bg-transparent !p-0">
          <TabPanel value="0" class="!p-4 sm:!p-5"><AssetsTab category-type="asset" /></TabPanel>
          <TabPanel value="1" class="!p-4 sm:!p-5"><AssetsTab category-type="cash-inflow" /></TabPanel>
          <TabPanel value="2" class="!p-4 sm:!p-5"><AssetsTab category-type="liability" /></TabPanel>
          <TabPanel value="3" class="!p-4 sm:!p-5"><CategoriesTab /></TabPanel>
          <TabPanel value="4" class="!p-4 sm:!p-5"><PeopleTab /></TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </PageShell>
</template>
