<script setup lang="ts">
const props = defineProps<{ username: string; eventId: string }>()
const open = defineModel<boolean>('open')

const toast = useToast()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) errorMessage.value = null
})

async function onConfirm() {
  loading.value = true
  errorMessage.value = null
  try {
    const res = await $fetch<{ invalidationId?: string; status?: string }>(
      `/api/galleries/${props.username}/${props.eventId}/invalidate-cache`,
      { method: 'POST' },
    )
    open.value = false
    toast.add({
      title: 'CloudFront invalidation submitted',
      description: res.invalidationId
        ? `${res.invalidationId} · ${res.status ?? 'InProgress'}`
        : 'Cache invalidation is propagating (5–15 min).',
      color: 'success',
      icon: 'i-lucide-refresh-ccw',
    })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
    errorMessage.value =
      err?.data?.message ??
      err?.statusMessage ??
      err?.message ??
      'Failed to invalidate cache'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Invalidate Gallery Cache">
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
          color="info"
          variant="subtle"
          icon="i-lucide-refresh-ccw"
          title="Purge CloudFront edge cache"
          :description="`Wildcard invalidation for '/${username}/${eventId}/*' (covers both originals and compressed). Takes 5–15 min to propagate. Only needed when re-uploading photos at previously-served paths.`"
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
          label="Invalidate"
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
