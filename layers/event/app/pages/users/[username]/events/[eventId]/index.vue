<script setup lang="ts">
import type { Event as AppEvent } from '#layers/event/shared/types/types'
import type { File } from '~~/layers/file/shared/types/types'

const route = useRoute()
const username = route.params.username as string
const eventId = route.params.eventId as string

const { event, status, error, refresh } = useEvent(username, eventId, { include: 'files' })
const { data: selection, status: selectionStatus, refresh: refreshSelection } = useSelection(username, eventId)
const { data: gallery, status: galleryStatus, refresh: refreshGallery } = useGallery(username, eventId)

const deleteSelectionOpen = ref(false)
const deleteGalleryOpen = ref(false)

async function onSelectionDeleted() {
  await refreshSelection()
  await refresh?.()
}

async function onGalleryDeleted() {
  await refreshGallery()
  await refresh?.()
}

const files = computed<File[]>(() => (event?.value as any)?.files ?? [])

const e = computed(() => event?.value as unknown as AppEvent | null)

const imagePlaceholderObjectKey = computed(() => e.value?.imagePlaceholderObjectKey)
const { coverUrl, selectedFile, fileInput, uploading, uploadError, onFileChange, uploadCover } =
  useCover(username, eventId, imagePlaceholderObjectKey, refresh ?? (() => Promise.resolve()))

const copied = ref<string | null>(null)

async function copyToClipboard(value: string, key: string) {
  await navigator.clipboard.writeText(value)
  copied.value = key
  setTimeout(() => { copied.value = null }, 1500)
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
        :to="`/users/${username}`"
      >
        Back to {{ username }}
      </UButton>
    </div>

    <div v-if="status !== 'success' && status !== 'error'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-6 text-muted" />
    </div>

    <UEmpty
      v-else-if="error?.statusCode === 404"
      icon="i-lucide-calendar-x"
      title="Event not found"
      :description="`No event with id '${eventId}' exists.`"
    />

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Failed to load event"
      :description="error.statusMessage || error.message || 'An unexpected error occurred.'"
    />

    <template v-else-if="e">
      <div class="border-b border-black pb-8 mb-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">Event</p>
        <h1 class="font-cormorant text-5xl font-light leading-none mb-4">
          {{ e.title }}
        </h1>
        <p class="text-gray-400 font-light italic">{{ formatDate(e.date) }}</p>
      </div>

      <div class="border border-gray-100 p-6 mb-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Details</p>
        <dl class="space-y-3">
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-28 shrink-0">Username</dt>
            <dd
              class="text-sm text-gray-600 cursor-pointer flex items-center gap-2 group"
              @click="copyToClipboard(e.username, 'username')"
            >
              {{ e.username }}
              <UIcon
                :name="copied === 'username' ? 'i-lucide-check' : 'i-lucide-copy'"
                class="size-3 opacity-0 group-hover:opacity-100 transition-opacity"
                :class="copied === 'username' ? 'text-black' : 'text-gray-400'"
              />
            </dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-28 shrink-0">Event ID</dt>
            <dd
              class="text-sm font-mono text-gray-600 cursor-pointer flex items-center gap-2 group"
              @click="copyToClipboard(e.eventId, 'eventId')"
            >
              {{ e.eventId }}
              <UIcon
                :name="copied === 'eventId' ? 'i-lucide-check' : 'i-lucide-copy'"
                class="size-3 opacity-0 group-hover:opacity-100 transition-opacity"
                :class="copied === 'eventId' ? 'text-black' : 'text-gray-400'"
              />
            </dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-28 shrink-0">Created</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(e.createdAt) }}</dd>
          </div>
        </dl>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="border border-black p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Gallery</p>
          <span
            :class="e.galleryAvailable
              ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
              : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal'"
          >
            {{ e.galleryAvailable ? 'Available' : 'Unavailable' }}
          </span>
          <div class="mt-4">
            <div v-if="galleryStatus !== 'success' && galleryStatus !== 'error'" class="h-8" />
            <div v-else-if="gallery" class="flex items-center gap-2">
              <UButton
                :to="`/users/${username}/events/${eventId}/gallery`"
                color="neutral"
                variant="solid"
                label="View gallery"
                class="text-[10px] tracking-[0.25em] uppercase"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                aria-label="Delete gallery"
                class="text-gray-400 hover:text-black"
                @click="deleteGalleryOpen = true"
              />
            </div>
            <CreateGallery v-else :username="username" :event-id="e.eventId" :event-title="e.title" />
          </div>
        </div>

        <div class="border border-black p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Selection</p>
          <span
            :class="e.selectionAvailable
              ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
              : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal'"
          >
            {{ e.selectionAvailable ? 'Available' : 'Unavailable' }}
          </span>
          <div class="mt-4">
            <div v-if="selectionStatus !== 'success' && selectionStatus !== 'error'" class="h-8" />
            <div v-else-if="selection" class="flex items-center gap-2">
              <UButton
                :to="`/users/${username}/events/${eventId}/selections/${selection.selectionId}`"
                color="neutral"
                variant="solid"
                label="View selection"
                class="text-[10px] tracking-[0.25em] uppercase"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                aria-label="Delete selection"
                class="text-gray-400 hover:text-black"
                @click="deleteSelectionOpen = true"
              />
            </div>
            <CreateSelection v-else :username="username" :event-id="e.eventId" :event-title="e.title" />
          </div>
        </div>
      </div>

      <DeleteSelection
        v-if="selection"
        v-model:open="deleteSelectionOpen"
        :username="username"
        :event-id="eventId"
        :selection="selection"
        @deleted="onSelectionDeleted"
      />

      <DeleteGallery
        v-if="gallery"
        v-model:open="deleteGalleryOpen"
        :username="username"
        :event-id="eventId"
        :gallery="gallery"
        @deleted="onGalleryDeleted"
      />

      <!-- Gallery Cover -->
      <div class="border border-black mb-6">
        <div class="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400">Gallery Cover</p>
          <label
            v-if="coverUrl"
            class="text-[9px] tracking-[0.3em] uppercase font-normal text-gray-400 cursor-pointer hover:text-black transition-colors"
          >
            Change
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileChange"
            />
          </label>
        </div>

        <div class="p-6">
          <div v-if="coverUrl && !selectedFile" class="space-y-4">
            <div class="w-full aspect-square overflow-hidden border border-gray-100">
              <img
                :src="coverUrl"
                alt="Gallery cover"
                class="w-full h-full object-cover object-center"
              >
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              v-if="!selectedFile"
              class="border border-dashed border-gray-300 flex flex-col items-center justify-center py-12 gap-3"
            >
              <UIcon name="i-lucide-image" class="size-8 text-gray-300" />
              <p class="text-sm text-gray-400 font-light">No cover image</p>
              <label class="cursor-pointer">
                <span
                  class="inline-block px-4 py-2 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal hover:bg-black hover:text-white transition-colors"
                >
                  Choose Image
                </span>
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onFileChange"
                />
              </label>
            </div>

            <div v-if="selectedFile" class="space-y-4">
              <div class="flex items-center gap-3 p-3 border border-gray-100">
                <UIcon name="i-lucide-file-image" class="size-4 text-gray-400 shrink-0" />
                <span class="text-sm font-light text-black truncate">{{ selectedFile.name }}</span>
                <button
                  class="ml-auto text-gray-400 hover:text-black"
                  @click="selectedFile = null"
                >
                  <UIcon name="i-lucide-x" class="size-4" />
                </button>
              </div>

              <UAlert
                v-if="uploadError"
                color="error"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="uploadError"
              />

              <div class="flex gap-3">
                <UButton
                  :loading="uploading"
                  :disabled="uploading"
                  color="neutral"
                  class="bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal rounded-none px-5 py-2 hover:bg-gray-800"
                  @click="uploadCover"
                >
                  Upload Cover
                </UButton>
                <UButton
                  :disabled="uploading"
                  color="neutral"
                  variant="ghost"
                  class="text-[9px] tracking-[0.3em] uppercase font-normal text-gray-400"
                  @click="selectedFile = null"
                >
                  Cancel
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="e.description" class="border border-black p-6 mb-4">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">Description</p>
        <p class="font-light text-black leading-relaxed">{{ e.description }}</p>
      </div>

      <div class="flex justify-end mb-2">
        <AddFile :username="username" :event-id="eventId" @uploaded="refresh?.()" />
      </div>
      <FileList :files="files" @deleted="refresh?.()" />

    </template>
  </div>
</template>
