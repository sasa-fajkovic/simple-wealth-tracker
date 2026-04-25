<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import { useTheme } from '../composables/useTheme'

const { theme, toggle } = useTheme()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function handleOutsideClick(e: MouseEvent) {
  if (open.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleOutsideClick))
onUnmounted(() => document.removeEventListener('mousedown', handleOutsideClick))

const links = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/projections', label: 'Projections', exact: false },
  { to: '/cash-inflow', label: 'Cash Inflow', exact: false },
  { to: '/data-points', label: 'Data Points', exact: false },
  { to: '/admin', label: 'Admin', exact: false },
]
</script>

<template>
  <nav
    ref="menuRef"
    class="h-14 border-b px-4 sm:px-8 flex items-center justify-between relative transition-colors"
    :class="theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'"
  >
    <RouterLink
      to="/"
      class="text-lg font-semibold transition-colors"
      :class="theme === 'dark' ? 'text-zinc-100' : 'text-gray-900'"
    >WealthTrack</RouterLink>

    <div class="hidden sm:flex items-center gap-6">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :end="link.exact"
        class="font-medium text-sm transition-colors"
        :class="theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100' : 'text-gray-500 hover:text-gray-900'"
        active-class="!text-blue-500 font-semibold"
        exact-active-class=""
      >{{ link.label }}</RouterLink>

      <button
        class="border-0 bg-transparent cursor-pointer p-1 rounded transition-colors"
        :class="theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100' : 'text-gray-500 hover:text-gray-900'"
        :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle"
      >
        <span :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>
    </div>

    <div class="flex sm:hidden items-center gap-1">
      <button
        class="border-0 bg-transparent cursor-pointer p-1 rounded"
        :class="theme === 'dark' ? 'text-zinc-400' : 'text-gray-500'"
        @click="toggle"
      >
        <span :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>
      <Button
        :icon="open ? 'pi pi-times' : 'pi pi-bars'"
        text
        :aria-label="open ? 'Close navigation menu' : 'Open navigation menu'"
        @click="open = !open"
      />
    </div>

    <div
      v-if="open"
      class="absolute top-14 left-0 right-0 border-b z-50 flex flex-col py-2 transition-colors"
      :class="theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'"
    >
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :end="link.exact"
        class="px-4 py-3 text-sm font-medium transition-colors"
        :class="theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100' : 'text-gray-500 hover:text-gray-900'"
        active-class="!text-blue-500"
        @click="open = false"
      >{{ link.label }}</RouterLink>
    </div>
  </nav>
</template>
