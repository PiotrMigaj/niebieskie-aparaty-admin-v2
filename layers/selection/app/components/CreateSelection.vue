<script setup lang="ts">
import type { UploadFile } from '../composables/useSelectionUpload'

const props = defineProps<{
  username: string
  eventId: string
  eventTitle: string
}>()

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const {
  files,
  maxNumberOfPhotos,
  isUploading,
  uploadError,
  totalBytes,
  uploadedBytes,
  overallProgress,
  addFiles,
  removeFile,
  reset,
  startUpload,
} = useSelectionUpload(props.username, props.eventId, props.eventTitle)

const pendingCount = computed(() => files.value.filter((f) => f.status === 'pending').length)
const hasFiles = computed(() => files.value.length > 0)

watch(open, (isOpen) => {
  if (!isOpen) reset()
})

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusIcon(f: UploadFile) {
  if (f.status === 'pending') return 'i-lucide-clock'
  if (f.status === 'measuring' || f.status === 'uploading') return 'i-lucide-loader-circle'
  if (f.status === 'done') return 'i-lucide-check'
  return 'i-lucide-x'
}

function statusColor(f: UploadFile) {
  if (f.status === 'done') return 'text-green-600'
  if (f.status === 'failed') return 'text-red-500'
  return 'text-gray-400'
}

async function onSubmit() {
  const result = await startUpload()
  if (result.ok && result.selection) {
    open.value = false
    await navigateTo(
      `/users/${props.username}/events/${props.eventId}/selections/${result.selection.selectionId}`,
    )
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Create selection" :ui="{ content: 'max-w-2xl' }">
    <UButton
      label="Create selection"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <div class="space-y-5">
        <UAlert
          v-if="uploadError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't create selection"
          :description="uploadError"
        />

        <div class="border border-gray-100 px-4 py-3 space-y-1">
          <div class="flex gap-3 text-sm">
            <span class="text-gray-400 w-28 shrink-0">Username</span>
            <span class="text-gray-600">{{ username }}</span>
          </div>
          <div class="flex gap-3 text-sm">
            <span class="text-gray-400 w-28 shrink-0">Event ID</span>
            <span class="font-mono text-gray-600 text-xs break-all">{{ eventId }}</span>
          </div>
          <div class="flex gap-3 text-sm">
            <span class="text-gray-400 w-28 shrink-0">Event title</span>
            <span class="text-gray-600">{{ eventTitle }}</span>
          </div>
        </div>

        <UFormField label="Max number of photos" name="maxNumberOfPhotos" required>
          <UInput
            v-model="maxNumberOfPhotos"
            type="number"
            min="1"
            max="1000"
            placeholder="e.g. 100"
            :disabled="isUploading"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <div
          v-if="!isUploading"
          class="border-2 border-dashed transition-colors rounded-none p-8 text-center cursor-pointer"
          :class="isDragging ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'"
          @click="fileInput?.click()"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-image-plus" class="size-8 text-gray-300 mx-auto mb-3" />
          <p class="text-sm text-gray-500">
            Drag &amp; drop compressed images here or
            <span class="underline underline-offset-2 text-black">browse files</span>
          </p>
          <p class="text-[10px] tracking-widest uppercase text-gray-400 mt-1">
            Compress &amp; watermark on your machine before uploading
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            class="sr-only"
            @change="onFileInputChange"
          >
        </div>

        <div v-if="hasFiles" class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400">
              {{ files.length }} file{{ files.length !== 1 ? 's' : '' }}
              <span class="ml-2 text-gray-300">·</span>
              <span class="ml-2">{{ formatBytes(totalBytes) }}</span>
            </p>
            <p v-if="isUploading" class="text-[10px] tracking-widest uppercase text-gray-500">
              {{ formatBytes(uploadedBytes) }} / {{ formatBytes(totalBytes) }}
            </p>
          </div>

          <div v-if="isUploading" class="h-1 bg-gray-100 w-full">
            <div
              class="h-1 bg-black transition-all duration-200"
              :style="{ width: `${Math.round(overallProgress * 100)}%` }"
            />
          </div>

          <ul class="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            <li
              v-for="f in files"
              :key="f.file.name"
              class="flex items-center gap-3 py-2 text-sm"
            >
              <UIcon
                :name="statusIcon(f)"
                class="size-4 shrink-0"
                :class="[statusColor(f), (f.status === 'uploading' || f.status === 'measuring') ? 'animate-spin' : '']"
              />

              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-gray-700 font-mono text-xs">{{ f.file.name }}</span>
                  <span class="text-[11px] text-gray-400 shrink-0">{{ formatBytes(f.file.size) }}</span>
                </div>
                <div v-if="f.status === 'uploading'" class="h-0.5 bg-gray-100 w-full">
                  <div
                    class="h-0.5 bg-black transition-all duration-100"
                    :style="{ width: `${Math.round((f.loaded / f.file.size) * 100)}%` }"
                  />
                </div>
                <p v-if="f.status === 'failed' && f.error" class="text-[11px] text-red-500">{{ f.error }}</p>
              </div>

              <button
                v-if="f.status === 'pending' && !isUploading"
                class="shrink-0 text-gray-300 hover:text-gray-600 transition-colors"
                @click="removeFile(f.file.name)"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <p v-if="isUploading" class="text-[11px] tracking-widest uppercase text-gray-400">
          {{ Math.round(overallProgress * 100) }}% uploaded
        </p>
        <div v-else />

        <div class="flex items-center gap-3">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="isUploading"
            @click="open = false"
          />
          <UButton
            :label="pendingCount > 0 ? `Create with ${pendingCount} image${pendingCount !== 1 ? 's' : ''}` : 'Add images first'"
            color="neutral"
            variant="solid"
            class="text-[10px] tracking-[0.25em] uppercase"
            :loading="isUploading"
            :disabled="isUploading || pendingCount === 0"
            @click="onSubmit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
