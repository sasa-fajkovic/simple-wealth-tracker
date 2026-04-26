<script setup lang="ts">
import { onMounted } from 'vue'
import ConfirmDialog from 'primevue/confirmdialog'
import DataPointsTab from '../components/admin/DataPointsTab.vue'
import PageShell from '../components/ui/PageShell.vue'

onMounted(() => {
  document.title = 'History / Corrections — WealthTrack'
})
</script>

<template>
  <PageShell>
    <ConfirmDialog />
    <div class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Raw ledger</p>
      <h1 class="mt-1 text-xl font-bold text-gray-900 dark:text-zinc-100">History / Corrections</h1>
      <p class="mt-2 max-w-3xl text-sm text-gray-600 dark:text-zinc-400">
        Use this page to audit, edit, or delete individual historical values. For routine monthly entry,
        use Monthly Update.
      </p>
    </div>
    <DataPointsTab />
  </PageShell>
</template>
