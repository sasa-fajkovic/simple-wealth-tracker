<script setup lang="ts">
import Nav from './components/Nav.vue'
</script>

<template>
  <div class="min-h-screen transition-colors bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
    <Nav />
    <RouterView />
  </div>
</template>
