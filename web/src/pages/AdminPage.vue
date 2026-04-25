<script setup lang="ts">
import { onMounted } from 'vue'
import ConfirmDialog from 'primevue/confirmdialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import AssetsTab from '../components/admin/AssetsTab.vue'
import CategoriesTab from '../components/admin/CategoriesTab.vue'
import PeopleTab from '../components/admin/PeopleTab.vue'

onMounted(() => {
  document.title = 'Admin — WealthTrack'
})
</script>

<template>
  <div class="px-4 sm:px-6 py-6">
    <ConfirmDialog />
    <Tabs value="0">
      <TabList>
        <Tab value="0">Assets</Tab>
        <Tab value="1">Cash Inflow</Tab>
        <Tab value="2">Liabilities</Tab>
        <Tab value="3">Categories</Tab>
        <Tab value="4">People</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="0"><AssetsTab category-type="asset" /></TabPanel>
        <TabPanel value="1"><AssetsTab category-type="cash-inflow" /></TabPanel>
        <TabPanel value="2"><AssetsTab category-type="liability" /></TabPanel>
        <TabPanel value="3"><CategoriesTab /></TabPanel>
        <TabPanel value="4"><PeopleTab /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
