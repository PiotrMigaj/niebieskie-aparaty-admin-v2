<script setup lang="ts">
import type { File } from '~~/layers/file/shared/types/types'

const props = defineProps<{ file: File }>()
const open = defineModel<boolean>('open')
const emit = defineEmits<{ deleted: [] }>()

const loading = ref(false)
const errorMessage = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) errorMessage.value = null
})

async function onConfirm() {
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch(`/api/files/${props.file.username}/${props.file.eventId}/${props.file.fileId}`, {
      method: 'DELETE',
    })
    open.value = false
    emit('deleted')
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
    errorMessage.value =
      err?.data?.message ??
      err?.statusMessage ??
      err?.message ??
      'Failed to delete file'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Delete File">
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Action failed"
          :description="errorMessage"
          :close="{ onClick: () => { errorMessage = null } }"
        />
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          title="Delete file permanently"
          :description="`'${file.objectKey}' will be removed from the bucket and cannot be recovered.`"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="loading"
          @click="open = false"
        />
        <UButton
          label="Delete"
          color="neutral"
          variant="solid"
          class="text-[10px] tracking-[0.25em] uppercase"
          :loading="loading"
          :disabled="loading"
          @click="onConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
