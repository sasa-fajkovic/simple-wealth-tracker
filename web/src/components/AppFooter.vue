<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const sha = ref<string>('dev')

onMounted(async () => {
  try {
    const res = await fetch('/api/v1/version')
    const data = await res.json()
    sha.value = data.sha ?? 'dev'
  } catch {
    // silently keep 'dev'
  }
})

const shortSha = computed(() => sha.value.slice(0, 7))
const ghcrUrl = 'https://github.com/sasa-fajkovic/simple-wealth-tracker/pkgs/container/simple-wealth-tracker'
const repoUrl = 'https://github.com/sasa-fajkovic/simple-wealth-tracker'
</script>

<template>
  <footer class="w-full border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 px-6 py-2">
    <div class="max-w-screen-2xl mx-auto flex items-center justify-between text-xs text-gray-400 dark:text-zinc-600">
      <!-- GitHub repo link -->
      <a
        :href="repoUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-1.5 hover:text-gray-600 dark:hover:text-zinc-400 transition-colors"
      >
        <!-- GitHub icon -->
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 fill-current" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
            0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
            -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
            .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
            -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
            .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
            .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
            0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>sasa-fajkovic/simple-wealth-tracker</span>
      </a>

      <!-- SHA link to GHCR -->
      <a
        :href="ghcrUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-mono hover:text-gray-600 dark:hover:text-zinc-400 transition-colors"
        :title="`Image: ${sha}`"
      >
        {{ shortSha }}
      </a>
    </div>
  </footer>
</template>
