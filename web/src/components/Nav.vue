<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import { useTheme } from '../composables/useTheme'

const { theme, toggle } = useTheme()
const route = useRoute()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function handleOutsideClick(e: MouseEvent) {
  if (open.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}

// Close mobile menu on any route change (covers programmatic and link navigation)
watch(() => route.path, () => { open.value = false })

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('keydown', handleEscape)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('keydown', handleEscape)
})

const links = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/analytics', label: 'Analytics', exact: false },
  { to: '/income', label: 'Income', exact: false },
  { to: '/projections', label: 'Projections', exact: false },
  { to: '/monthly-update', label: 'Monthly Update', exact: false },
  { to: '/admin', label: 'Admin', exact: false },
]

const themeLabel = (t: string) => t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

function desktopLinkClass(active: boolean) {
  if (active) {
    return theme.value === 'dark'
      ? 'bg-zinc-800 text-zinc-50 shadow-sm ring-1 ring-zinc-700'
      : 'bg-gray-100 text-gray-950 shadow-sm ring-1 ring-gray-200'
  }
  return theme.value === 'dark'
    ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
    : 'text-gray-500 hover:bg-gray-100/70 hover:text-gray-900'
}

function mobileLinkClass(active: boolean) {
  if (active) {
    return theme.value === 'dark'
      ? 'bg-zinc-800 text-zinc-50'
      : 'bg-gray-100 text-gray-950'
  }
  return theme.value === 'dark'
    ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
    : 'text-gray-500 hover:bg-gray-100/70 hover:text-gray-900'
}
</script>

<template>
  <!-- wt-nav applies safe-area-inset-left/right for notched devices -->
  <nav
    ref="menuRef"
    class="wt-nav h-14 border-b flex items-center justify-between relative transition-colors"
    :class="theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'"
  >
    <RouterLink
      to="/"
      class="text-lg font-semibold transition-colors"
      :class="theme === 'dark' ? 'text-zinc-100' : 'text-gray-900'"
    >WealthTrack</RouterLink>

    <!-- Desktop nav -->
    <div class="hidden sm:flex items-center gap-6">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :end="link.exact"
        custom
        v-slot="{ href, navigate, isActive, isExactActive }"
      >
        <a
          :href="href"
          :aria-current="(link.exact ? isExactActive : isActive) ? 'page' : undefined"
          :class="[
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            desktopLinkClass(link.exact ? isExactActive : isActive),
          ]"
          @click="navigate"
        >
          {{ link.label }}
        </a>
      </RouterLink>

      <!-- 44px touch target for theme toggle (WCAG 2.5.5) -->
      <button
        class="wt-touch-target border-0 bg-transparent cursor-pointer rounded transition-colors"
        :class="theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100' : 'text-gray-500 hover:text-gray-900'"
        :aria-label="themeLabel(theme)"
        @click="toggle"
      >
        <span :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>
    </div>

    <!-- Mobile controls: theme toggle + hamburger, both 44px -->
    <div class="flex sm:hidden items-center gap-1">
      <button
        class="wt-touch-target border-0 bg-transparent cursor-pointer rounded"
        :class="theme === 'dark' ? 'text-zinc-400' : 'text-gray-500'"
        :aria-label="themeLabel(theme)"
        @click="toggle"
      >
        <span :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>
      <Button
        :icon="open ? 'pi pi-times' : 'pi pi-bars'"
        text
        :aria-label="open ? 'Close navigation menu' : 'Open navigation menu'"
        class="wt-touch-target"
        @click="open = !open"
      />
    </div>

    <!-- Mobile dropdown; wt-nav-menu adds safe-area bottom padding -->
    <div
      v-if="open"
      class="wt-nav-menu absolute top-14 left-0 right-0 border-b z-50 flex flex-col py-2 transition-colors"
      :class="theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'"
    >
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :end="link.exact"
        custom
        v-slot="{ href, navigate, isActive, isExactActive }"
      >
        <a
          :href="href"
          :aria-current="(link.exact ? isExactActive : isActive) ? 'page' : undefined"
          :class="[
            'mx-2 flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium transition-colors',
            mobileLinkClass(link.exact ? isExactActive : isActive),
          ]"
          @click="(event) => { navigate(event); open = false }"
        >
          {{ link.label }}
        </a>
      </RouterLink>
    </div>
  </nav>
</template>
