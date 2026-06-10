<script setup lang="ts">
import type { Gallery } from '#layers/gallery/shared/types/types'

const props = defineProps<{
  username: string
  eventId: string
  eventTitle: string
}>()

const open = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function clearError() {
  errorMessage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) errorMessage.value = null
})

async function onConfirm() {
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch<Gallery>('/api/galleries', {
      method: 'POST',
      body: {
        username: props.username,
        eventId: props.eventId,
        eventTitle: props.eventTitle,
      },
    })
    open.value = false
    await navigateTo(`/users/${props.username}/events/${props.eventId}/gallery`)
  } catch (e: unknown) {
    const err = e as { status?: number; data?: { message?: string }; statusMessage?: string; message?: string }
    if (err?.status === 409) {
      errorMessage.value = 'A gallery already exists for this event'
    } else {
      errorMessage.value =
        err?.data?.message ??
        err?.statusMessage ??
        err?.message ??
        'Failed to create gallery'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Create gallery">
    <UButton
      label="Create gallery"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <div class="space-y-5">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't create gallery"
          :description="errorMessage"
          :close="{ onClick: clearError }"
        />

        <p class="text-sm text-gray-600 font-light leading-relaxed">
          Do you really want to create a gallery for
          <span class="font-cormorant text-lg text-black">{{ eventTitle }}</span>?
        </p>

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
          label="Create"
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
