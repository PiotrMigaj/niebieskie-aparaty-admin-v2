<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { File } from '~~/layers/file/shared/types/types'

defineProps<{ files: File[] }>()
const emit = defineEmits<{ deleted: [] }>()

const UDropdownMenu = resolveComponent('UDropdownMenu')
const UButton = resolveComponent('UButton')

const fileToDelete = ref<File | null>(null)
const deleteOpen = ref(false)

watch(fileToDelete, (v) => {
  if (v) deleteOpen.value = true
})

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const columns: TableColumn<File>[] = [
  {
    accessorKey: 'objectKey',
    header: 'File',
    cell: ({ row }) => h('span', { class: 'font-mono text-sm text-black' }, row.original.objectKey),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => h('span', { class: 'text-sm text-gray-600 font-light' }, row.original.description),
  },
  {
    accessorKey: 'createdAt',
    header: 'Uploaded',
    cell: ({ row }) => h('span', { class: 'text-gray-400 font-light italic text-sm' }, formatDate(row.original.createdAt)),
  },
  {
    accessorKey: 'dateOfLastDownload',
    header: 'Last Download',
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-gray-400 font-light italic text-sm' },
        row.original.dateOfLastDownload ? formatDate(row.original.dateOfLastDownload) : '—',
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
                label: 'Delete',
                icon: 'i-lucide-trash-2',
                onSelect: () => { fileToDelete.value = row.original },
              },
            ],
          ],
        },
        () => h(UButton, { icon: 'i-lucide-ellipsis', color: 'neutral', variant: 'ghost', 'aria-label': 'Actions' }),
      ),
  },
]
</script>

<template>
  <div class="border border-black mt-6">
    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
      <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400">Files</p>
      <span class="text-xs text-gray-400 font-light">
        {{ files.length }} {{ files.length === 1 ? 'file' : 'files' }}
      </span>
    </div>

    <UTable
      :data="files"
      :columns="columns"
      :ui="{
        root: 'w-full',
        thead: 'bg-white',
        th: 'text-[10px] tracking-[0.3em] uppercase font-normal text-gray-400 py-4 px-6 border-b border-gray-100 text-left',
        td: 'py-4 px-6 border-b border-gray-100 text-sm align-middle',
        tr: 'hover:bg-gray-50 transition-colors duration-150',
        empty: 'py-12 text-center text-gray-400 italic text-sm',
      }"
      empty="No files uploaded yet"
    />

    <DeleteFile
      v-if="fileToDelete"
      v-model:open="deleteOpen"
      :file="fileToDelete"
      @deleted="emit('deleted'); fileToDelete = null"
    />
  </div>
</template>
