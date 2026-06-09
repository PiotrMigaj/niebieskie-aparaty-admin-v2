<script setup lang="ts">
import type { Selection } from '#layers/selection/shared/types/types'

const props = defineProps<{
  username: string
  eventId: string
  eventTitle: string
}>()

const open = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const maxPhotosInput = ref<string>('')

function clearError() {
  errorMessage.value = null
}

function resetForm() {
  maxPhotosInput.value = ''
  errorMessage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})

async function onSubmit() {
  const maxPhotos = parseInt(maxPhotosInput.value, 10)
  if (isNaN(maxPhotos) || maxPhotos < 1 || maxPhotos > 1000) {
    errorMessage.value = 'Max photos must be between 1 and 1000'
    return
  }

  loading.value = true
  errorMessage.value = null
  try {
    const created = await $fetch<Selection>('/api/selections', {
      method: 'POST',
      body: {
        username: props.username,
        eventId: props.eventId,
        eventTitle: props.eventTitle,
        maxNumberOfPhotos: maxPhotos,
      },
    })
    open.value = false
    await navigateTo(`/users/${props.username}/events/${props.eventId}/selections/${created.selectionId}`)
  } catch (e: unknown) {
    const err = e as { status?: number; data?: { message?: string }; statusMessage?: string; message?: string }
    if (err?.status === 409) {
      errorMessage.value = 'A selection already exists for this event'
    } else {
      errorMessage.value =
        err?.data?.message ??
        err?.statusMessage ??
        err?.message ??
        'Failed to create selection'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Create selection">
    <UButton
      label="Create selection"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <form id="create-selection-form" class="space-y-5" @submit.prevent="onSubmit">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't create selection"
          :description="errorMessage"
          :close="{ onClick: clearError }"
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
            v-model="maxPhotosInput"
            type="number"
            min="1"
            max="1000"
            placeholder="e.g. 100"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>
      </form>
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
          type="submit"
          form="create-selection-form"
          label="Create"
          color="neutral"
          variant="solid"
          class="text-[10px] tracking-[0.25em] uppercase"
          :loading="loading"
          :disabled="loading"
        />
      </div>
    </template>
  </UModal>
</template>
