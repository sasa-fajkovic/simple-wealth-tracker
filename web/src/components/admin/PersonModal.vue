<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Person, CreatePersonPayload, UpdatePersonPayload } from '../../types/index'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const props = defineProps<{
  mode: 'create' | 'edit'
  item?: Person
  existingIds?: string[]
  saving: boolean
  saveError: string | null
  onSave: (payload: CreatePersonPayload | UpdatePersonPayload) => void
  onCancel: () => void
}>()

const name = ref(props.mode === 'edit' ? props.item!.name : '')
const validationError = ref<string | null>(null)

const slugPreview = computed(() => props.mode === 'create' ? toSlug(name.value) : props.item!.id)
const slugConflict = computed(() => {
  if (props.mode !== 'create') return false
  const slug = slugPreview.value
  if (!slug) return false
  return (props.existingIds ?? []).includes(slug)
})

function handleSubmit() {
  if (!name.value.trim()) {
    validationError.value = 'Name is required'
    return
  }
  if (slugConflict.value) {
    validationError.value = `A person with id '${slugPreview.value}' already exists. Choose a different name.`
    return
  }
  validationError.value = null
  props.onSave({ name: name.value.trim() })
}
</script>

<template>
  <Dialog
    :header="mode === 'create' ? 'Add Person' : 'Edit Person'"
    :visible="true"
    @update:visible="(v) => !v && onCancel()"
    :style="{ width: '32rem' }"
    modal
    :draggable="false"
  >
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Name</label>
      <InputText v-model="name" class="w-full" autofocus />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">ID (slug) — read only</label>
      <input
        type="text"
        :value="slugPreview"
        readonly
        class="w-full bg-gray-50 dark:bg-zinc-950 cursor-not-allowed px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-md text-gray-500 dark:text-zinc-400"
      />
      <p v-if="slugConflict" class="text-xs text-red-600 mt-1">A person with id '{{ slugPreview }}' already exists.</p>
    </div>
    <p v-if="validationError" class="text-xs text-red-600 mt-2">{{ validationError }}</p>
    <p v-if="saveError" class="text-xs text-red-600 mt-2">{{ saveError }}</p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" outlined @click="onCancel" type="button" />
        <Button :label="saving ? 'Saving…' : 'Save'" :disabled="saving || slugConflict" @click="handleSubmit" type="button" />
      </div>
    </template>
  </Dialog>
</template>
