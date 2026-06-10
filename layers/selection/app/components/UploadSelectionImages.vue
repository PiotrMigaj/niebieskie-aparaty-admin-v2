<script setup lang="ts">
import type { UploadFile } from '../composables/useSelectionUpload'

const props = defineProps<{
  username: string
  eventId: string
}>()

const emit = defineEmits<{
  uploaded: []
}>()

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const uploadResult = ref<{ ok: number; failed: number } | null>(null)

const { files, isUploading, uploadError, totalBytes, uploadedBytes, overallProgress, addFiles, removeFile, reset, startUpload } =
  useSelectionUpload(props.username, props.eventId)

const pendingCount = computed(() => files.value.filter((f) => f.status === 'pending').length)
const hasFiles = computed(() => files.value.length > 0)
const allDone = computed(() => files.value.length > 0 && files.value.every((f) => f.status === 'done' || f.status === 'failed'))

watch(open, (isOpen) => {
  if (!isOpen) {
    reset()
    uploadResult.value = null
  }
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
  if (f.status === 'uploading') return 'i-lucide-loader-circle'
  if (f.status === 'done') return 'i-lucide-check'
  return 'i-lucide-x'
}

function statusColor(f: UploadFile) {
  if (f.status === 'done') return 'text-green-600'
  if (f.status === 'failed') return 'text-red-500'
  return 'text-gray-400'
}

async function onUpload() {
  uploadResult.value = null
  const result = await startUpload()
  uploadResult.value = result
  if (result.failed === 0) {
    emit('uploaded')
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Upload selection images" :ui="{ content: 'max-w-2xl' }">
    <UButton
      label="Upload images"
      icon="i-lucide-upload"
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
          title="Upload error"
          :description="uploadError"
        />

        <UAlert
          v-if="uploadResult && uploadResult.failed > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${uploadResult.failed} file${uploadResult.failed !== 1 ? 's' : ''} failed`"
          :description="`${uploadResult.ok} uploaded successfully, ${uploadResult.failed} failed. Check the list below for details.`"
        />

        <UAlert
          v-if="uploadResult && uploadResult.failed === 0"
          color="success"
          variant="subtle"
          icon="i-lucide-check-circle"
          :title="`${uploadResult.ok} image${uploadResult.ok !== 1 ? 's' : ''} uploaded`"
          description="All images were uploaded successfully and are queued for processing."
        />

        <div
          v-if="!allDone"
          class="border-2 border-dashed transition-colors rounded-none p-8 text-center cursor-pointer"
          :class="isDragging ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'"
          @click="fileInput?.click()"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-image-plus" class="size-8 text-gray-300 mx-auto mb-3" />
          <p class="text-sm text-gray-500">
            Drag &amp; drop images here or
            <span class="underline underline-offset-2 text-black">browse files</span>
          </p>
          <p class="text-[10px] tracking-widest uppercase text-gray-400 mt-1">
            JPEG, PNG, TIFF, RAW and other formats
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
                :class="[statusColor(f), f.status === 'uploading' ? 'animate-spin' : '']"
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
          {{ Math.round(overallProgress * 100) }}% complete
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
            v-if="!allDone"
            :label="pendingCount > 0 ? `Upload ${pendingCount} image${pendingCount !== 1 ? 's' : ''}` : 'Select images first'"
            color="neutral"
            variant="solid"
            class="text-[10px] tracking-[0.25em] uppercase"
            :loading="isUploading"
            :disabled="isUploading || pendingCount === 0"
            @click="onUpload"
          />
          <UButton
            v-else
            label="Close"
            color="neutral"
            variant="solid"
            class="text-[10px] tracking-[0.25em] uppercase"
            @click="open = false"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
