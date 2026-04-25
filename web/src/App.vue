<script setup lang="ts">
import Nav from './components/Nav.vue'
import AppFooter from './components/AppFooter.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col transition-colors bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
    <Nav />
    <div class="flex-1">
      <RouterView />
    </div>
    <AppFooter />
  </div>
</template>
