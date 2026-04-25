<script setup lang="ts">
import { onMounted } from 'vue'
import ConfirmDialog from 'primevue/confirmdialog'
import DataPointsTab from '../components/admin/DataPointsTab.vue'

onMounted(() => {
  document.title = 'Data Points — WealthTrack'
})
</script>

<template>
  <div class="px-4 sm:px-6 py-6">
    <ConfirmDialog />
    <h1 class="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-6">Data Points</h1>
    <DataPointsTab />
  </div>
</template>
