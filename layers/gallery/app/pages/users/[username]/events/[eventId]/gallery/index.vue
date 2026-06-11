<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Gallery, GalleryItem, GalleryItemStatus } from '#layers/gallery/shared/types/types'

type GalleryWithItems = Gallery & { items?: GalleryItem[] }

const route = useRoute()
const username = route.params.username as string
const eventId = route.params.eventId as string

const { data, status, error, refresh } = useGallery(username, eventId, { include: 'items' })

const g = computed(() => data.value as unknown as GalleryWithItems | null)
const items = computed<GalleryItem[]>(() => g.value?.items ?? [])

const UBadge = resolveComponent('UBadge')

let es: EventSource | null = null

function closeStream() {
  if (es != null) {
    es.close()
    es = null
  }
}

function openStream() {
  if (es != null || !import.meta.client) return
  es = new EventSource(`/api/galleries/${username}/${eventId}/stream`)
  es.addEventListener('gallery', (ev) => {
    data.value = JSON.parse((ev as MessageEvent).data) as GalleryWithItems
  })
  es.addEventListener('not-found', () => {
    closeStream()
  })
  es.addEventListener('error', () => {
    closeStream()
  })
}

const isProcessing = computed(
  () => !!g.value && g.value.totalPhotos != null && !g.value.isUploaded,
)

watch(
  isProcessing,
  (active) => {
    if (active) openStream()
    else closeStream()
  },
  { immediate: true },
)

onBeforeUnmount(closeStream)

function formatDate(value: string | Date | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusBadgeColor(s: GalleryItemStatus) {
  return s === 'processed' ? 'success' : 'error'
}

const columns: TableColumn<GalleryItem>[] = [
  {
    accessorKey: 'originalFileName',
    header: 'Filename',
    cell: ({ row }) =>
      h(
        'span',
        { class: 'font-mono text-xs text-gray-700' },
        row.original.originalFileName,
      ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) =>
      h(
        UBadge,
        {
          color: statusBadgeColor(row.original.status),
          variant: 'subtle',
          class: 'text-[9px] tracking-[0.25em] uppercase',
        },
        () => row.original.status,
      ),
  },
  {
    accessorKey: 'compressedSize',
    header: 'Compressed',
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-xs text-gray-500' },
        formatBytes(row.original.compressedSize),
      ),
  },
]

const processedTotal = computed(
  () => (g.value?.processedSuccessPhotos ?? 0) + (g.value?.processedFailedPhotos ?? 0),
)
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
      title="Gallery not found"
      :description="`No gallery exists for event '${eventId}'.`"
    />

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Failed to load gallery"
      :description="error.statusMessage || error.message || 'An unexpected error occurred.'"
    />

    <template v-else-if="g">
      <div class="border-b border-black pb-8 mb-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">Gallery</p>
        <h1 class="font-cormorant text-5xl font-light leading-none mb-4">
          {{ g.eventTitle }}
        </h1>
        <div class="flex items-center gap-4">
          <span
            :class="g.isUploaded
              ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
              : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal'"
          >
            {{ g.isUploaded ? 'Ready' : 'In progress' }}
          </span>
          <UploadGalleryImages
            v-if="!g.isUploaded"
            :username="username"
            :event-id="eventId"
            @uploaded="refresh()"
          />
        </div>
      </div>

      <div class="border border-gray-100 p-6 mb-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Identifiers</p>
        <dl class="space-y-3">
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Gallery ID</dt>
            <dd class="text-sm font-mono text-gray-600 break-all">{{ g.galleryId }}</dd>
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

      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="border border-gray-100 p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Total</p>
          <p class="text-3xl font-cormorant font-light">{{ g.totalPhotos ?? '—' }}</p>
          <p class="text-[9px] tracking-[0.2em] uppercase text-gray-400 mt-1">photos uploaded</p>
        </div>
        <div class="border border-gray-100 p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Processed</p>
          <p class="text-3xl font-cormorant font-light">
            {{ processedTotal }}<span v-if="g.totalPhotos != null" class="text-gray-300 text-xl"> / {{ g.totalPhotos }}</span>
          </p>
          <p class="text-[9px] tracking-[0.2em] uppercase text-gray-400 mt-1">
            {{ g.processedSuccessPhotos }} ok · {{ g.processedFailedPhotos }} failed
          </p>
        </div>
        <div class="border border-gray-100 p-6">
          <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Status</p>
          <p class="text-3xl font-cormorant font-light">
            {{ g.isUploaded ? 'Done' : 'Working' }}
          </p>
          <p class="text-[9px] tracking-[0.2em] uppercase text-gray-400 mt-1">
            {{ g.isUploaded ? 'all images processed' : 'auto-refreshing…' }}
          </p>
        </div>
      </div>

      <div class="border border-gray-100 p-6 mb-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Items</p>
        <UEmpty
          v-if="items.length === 0"
          icon="i-lucide-image"
          title="No items yet"
          description="Items appear here as the upload pipeline processes each original."
        />
        <UTable
          v-else
          :data="items"
          :columns="columns"
          class="text-sm"
        />
      </div>

      <div class="border border-gray-100 p-6">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-4">Timestamps</p>
        <dl class="space-y-3">
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Started</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(g.uploadStartedAt) }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Completed</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(g.uploadCompletedAt) }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Created</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(g.createdAt) }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="text-gray-400 text-sm w-36 shrink-0">Updated</dt>
            <dd class="text-sm text-gray-600 italic">{{ formatDate(g.updatedAt) }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </div>
</template>
