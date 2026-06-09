<script setup lang="ts">
const props = defineProps<{ username: string; eventId: string }>()
const emit = defineEmits<{ uploaded: [] }>()

const open = ref(false)

const {
  selectedFile,
  description,
  uploading,
  uploadedBytes,
  totalBytes,
  progress,
  uploadError,
  onFileChange,
  clearFile,
  reset,
  upload,
} = useMultipartUpload(props.username, props.eventId, async () => {
  emit('uploaded')
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen && !uploading.value) reset()
})

function formatMB(bytes: number) {
  return (bytes / 1_000_000).toFixed(1)
}

const canSubmit = computed(
  () => !!selectedFile.value && description.value.trim().length > 0 && !uploading.value,
)
</script>

<template>
  <UModal v-model:open="open" title="Add file" :dismissible="!uploading">
    <UButton
      label="Add file"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <div class="space-y-5">
        <div class="border border-gray-100 px-4 py-3 space-y-1">
          <div class="flex gap-3 text-sm">
            <span class="text-gray-400 w-20 shrink-0">Username</span>
            <span class="text-gray-600">{{ username }}</span>
          </div>
          <div class="flex gap-3 text-sm">
            <span class="text-gray-400 w-20 shrink-0">Event ID</span>
            <span class="font-mono text-gray-600">{{ eventId }}</span>
          </div>
        </div>

        <UFormField label="Description" name="description" required>
          <UTextarea
            v-model="description"
            :rows="3"
            :disabled="uploading"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="File" name="file" required>
          <div v-if="!selectedFile">
            <label class="cursor-pointer">
              <span
                class="inline-block px-4 py-2 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal hover:bg-black hover:text-white transition-colors"
              >
                Choose File
              </span>
              <input type="file" class="hidden" @change="onFileChange">
            </label>
          </div>

          <div v-else class="flex items-center gap-3 p-3 border border-gray-100">
            <UIcon name="i-lucide-file" class="size-4 text-gray-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-light text-black truncate">{{ selectedFile.name }}</p>
              <p class="text-xs text-gray-400">{{ formatMB(selectedFile.size) }} MB</p>
            </div>
            <button
              v-if="!uploading"
              class="text-gray-400 hover:text-black"
              @click="clearFile"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </UFormField>

        <div v-if="uploading" class="space-y-2">
          <UProgress :value="Math.round(progress * 100)" :max="100" />
          <p class="text-xs text-gray-400 font-light italic">
            {{ Math.round(progress * 100) }}% — {{ formatMB(uploadedBytes) }} / {{ formatMB(totalBytes) }} MB
          </p>
        </div>

        <UAlert
          v-if="uploadError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Upload failed"
          :description="uploadError"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="uploading"
          @click="open = false"
        />
        <UButton
          label="Upload"
          color="neutral"
          variant="solid"
          class="text-[10px] tracking-[0.25em] uppercase"
          :loading="uploading"
          :disabled="!canSubmit"
          @click="upload"
        />
      </div>
    </template>
  </UModal>
</template>
