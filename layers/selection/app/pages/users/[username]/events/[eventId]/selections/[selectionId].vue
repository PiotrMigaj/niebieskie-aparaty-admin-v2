<script setup lang="ts">
import type { Selection } from '#layers/selection/shared/types/types'

const route = useRoute()
const username = route.params.username as string
const eventId = route.params.eventId as string
const selectionId = route.params.selectionId as string

const { data, status, error } = useSelection(username, eventId)

const s = computed(() => data.value as unknown as Selection | null)

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="mb-8">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        class="text-gray-400 -ml-2"
        :to="`/users/${username}/events/${eventId}`"
      >
        Back to event
      </UButton>
    </div>

    <div v-if="status !== 'success' && status !== 'error'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-6 text-muted" />
    </div>

    <UEmpty
      v-else-if="error?.statusCode === 404"
      icon="i-lucide-folder-x"
      title="Selection not found"
      :description="`No selection exists for event '${eventId}'.`"
    />

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Failed to load selection"
      :description="error.statusMessage || error.message || 'An unexpected error occurred.'"
    />

    <template v-else-if="s">
      <div class="border-b border-black pb-8 mb-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">Selection</p>
        <h1 class="font-cormorant text-5xl font-light leading-none mb-4">
          {{ s.eventTitle }}
        </h1>
        <span
          :class="s.blocked
            ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
            : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal'"
        >
          {{ s.blocked ? 'Blocked' : 'Active' }}
        </span>
      </div>

      <div class="border border-gray-100 p-6 mb-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Identifiers</p>
        <dl class="space-y-3">
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Selection ID</dt>
            <dd class="text-sm font-mono text-gray-600 break-all">{{ selectionId }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Event ID</dt>
            <dd class="text-sm font-mono text-gray-600 break-all">{{ eventId }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Username</dt>
            <dd class="text-sm text-gray-600">{{ username }}</dd>
          </div>
        </dl>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="border border-gray-100 p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Photo limit</p>
          <p class="text-3xl font-cormorant font-light">{{ s.maxNumberOfPhotos }}</p>
          <p class="text-[9px] tracking-[0.2em] uppercase text-gray-400 mt-1">max photos</p>
        </div>
        <div class="border border-gray-100 p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Selected</p>
          <p class="text-3xl font-cormorant font-light">{{ s.selectedNumberOfPhotos }}</p>
          <p class="text-[9px] tracking-[0.2em] uppercase text-gray-400 mt-1">photos chosen</p>
        </div>
      </div>

      <div class="border border-gray-100 p-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Timestamps</p>
        <dl class="space-y-3">
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Created</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(s.createdAt) }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Updated</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(s.updatedAt) }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </div>
</template>
