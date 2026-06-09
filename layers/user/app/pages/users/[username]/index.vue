<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Event } from '#layers/event/shared/types/types'

const UDropdownMenu = resolveComponent('UDropdownMenu')
const UButton = resolveComponent('UButton')

const route = useRoute()
const username = route.params.username as string
const { user, status, error, refresh } = useUser(username, { include: 'events' })

const events = computed<Event[]>(() => user?.value?.events ?? [])
const hasEvents = computed(() => events.value.length > 0)

const globalFilter = ref('')

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const columns: TableColumn<Event>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) =>
      h('span', { class: 'font-medium text-black' }, row.original.title),
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-gray-400 font-light italic' },
        formatDate(row.original.date),
      ),
  },
  {
    accessorKey: 'galleryAvailable',
    header: 'Gallery',
    cell: ({ row }) =>
      h(
        'span',
        {
          class: row.original.galleryAvailable
            ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
            : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal',
        },
        row.original.galleryAvailable ? 'Available' : 'Unavailable',
      ),
  },
  {
    accessorKey: 'selectionAvailable',
    header: 'Selection',
    cell: ({ row }) =>
      h(
        'span',
        {
          class: row.original.selectionAvailable
            ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
            : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal',
        },
        row.original.selectionAvailable ? 'Available' : 'Unavailable',
      ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-gray-400 font-light italic' },
        formatDate(row.original.createdAt),
      ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      h(
        UDropdownMenu,
        {
          items: [
            [
              {
                label: 'View event',
                icon: 'i-lucide-eye',
                onSelect: () =>
                  navigateTo(
                    `/users/${username}/events/${row.original.eventId}`,
                  ),
              },
            ],
          ],
        },
        () =>
          h(UButton, {
            icon: 'i-lucide-ellipsis',
            color: 'neutral',
            variant: 'ghost',
            'aria-label': 'Actions',
          }),
      ),
  },
]
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <div v-if="status !== 'success' && status !== 'error'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-6 text-muted" />
    </div>

    <UEmpty
      v-else-if="error?.statusCode === 404"
      icon="i-lucide-user-x"
      title="User not found"
      :description="`No user with username '${username}' exists.`"
    />

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Failed to load user"
      :description="error.statusMessage || error.message || 'An unexpected error occurred.'"
    />

    <template v-else-if="user">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-user-circle" class="size-8 text-muted" />
            <div>
              <p class="font-semibold text-lg">{{ user.fullName }}</p>
              <p class="text-sm text-muted">@{{ user.username }}</p>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <UBadge
                :color="user.active ? 'success' : 'neutral'"
                variant="subtle"
                class="capitalize"
              >
                {{ user.active ? 'Active' : 'Inactive' }}
              </UBadge>
              <ToggleUserStatus
                :username="user.username"
                :active="user.active"
                @toggled="refresh?.()"
              />
            </div>
          </div>
        </template>

        <dl class="space-y-3">
          <div class="flex gap-2">
            <dt class="text-muted w-24 shrink-0">Email</dt>
            <dd>{{ user.email }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-muted w-24 shrink-0">Username</dt>
            <dd>{{ user.username }}</dd>
          </div>
        </dl>
      </UCard>

      <section class="mt-12">
        <div class="flex items-center justify-between mb-8">
          <div>
            <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-2">
              Events
            </p>
            <h2 class="text-2xl font-light text-black leading-none">
              {{ hasEvents ? `${events.length} ${events.length === 1 ? 'event' : 'events'}` : 'No events yet' }}
            </h2>
          </div>
          <div class="flex items-center gap-3">
            <UInput
              v-if="hasEvents"
              v-model="globalFilter"
              placeholder="Search events..."
              icon="i-lucide-search"
              :ui="{ base: 'rounded-none', root: 'w-72' }"
              class="border-black"
            />
            <CreateEvent :username="username" />
          </div>
        </div>

        <UTable
          v-model:global-filter="globalFilter"
          :data="events"
          :columns="columns"
          :ui="{
            root: 'w-full border border-black',
            thead: 'bg-white',
            th: 'text-[10px] tracking-[0.3em] uppercase font-normal text-gray-400 py-4 px-6 border-b border-black text-left',
            td: 'py-5 px-6 border-b border-gray-100 text-sm align-middle',
            tr: 'hover:bg-gray-50 transition-colors duration-150 cursor-default',
            empty: 'py-16 text-center text-gray-400 italic text-sm',
          }"
          empty="No events"
        />
      </section>
    </template>
  </div>
</template>
