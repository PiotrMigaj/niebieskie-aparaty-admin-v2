<template>
  <div v-if="status !== 'success'" class="flex justify-center items-center min-h-[60vh]">
    <UIcon name="i-lucide-loader-circle" class="animate-spin size-6 text-gray-400" />
  </div>

  <div v-else class="bg-white">
    <!-- Page header -->
    <div class="border-b border-black px-10 py-14">
      <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">
        Admin panel
      </p>
      <h1 class="text-4xl font-light text-black leading-none">
        Users
      </h1>
      <p class="text-lg text-gray-400 mt-4 font-light italic">
        Manage photographer accounts and permissions
      </p>
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 border-b border-black">
      <div class="border-r border-black px-10 py-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">
          All users
        </p>
        <p class="text-6xl font-light text-black">{{ totalUsers }}</p>
      </div>
      <div class="border-r border-black px-10 py-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">
          Active accounts
        </p>
        <p class="text-6xl font-light text-black">{{ activeUsers }}</p>
      </div>
      <div class="px-10 py-8">
        <p class="text-[10px] tracking-[0.35em] uppercase text-gray-400 mb-3">
          Administrators
        </p>
        <p class="text-6xl font-light text-black">{{ adminUsers }}</p>
      </div>
    </div>

    <!-- Table section -->
    <div class="px-10 py-10">
      <div class="flex items-center justify-between mb-8">
        <UInput
          v-model="globalFilter"
          placeholder="Search users..."
          icon="i-lucide-search"
          :ui="{ base: 'rounded-none', root: 'w-72' }"
          class="border-black"
        />
        <AddUser />
      </div>

      <UTable
        v-model:global-filter="globalFilter"
        :data="users"
        :columns="columns"
        :ui="{
          root: 'w-full border border-black',
          thead: 'bg-white',
          th: 'text-[10px] tracking-[0.3em] uppercase font-normal text-gray-400 py-4 px-6 border-b border-black text-left',
          td: 'py-5 px-6 border-b border-gray-100 text-sm align-middle',
          tr: 'hover:bg-gray-50 transition-colors duration-150 cursor-default',
          empty: 'py-16 text-center text-gray-400 italic text-sm',
        }"
        empty="No users"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { UserRole } from '../../shared/types'
import type { User } from '../../shared/types'

const UDropdownMenu = resolveComponent('UDropdownMenu')
const UButton = resolveComponent('UButton')

const { users, status } = useUsers()

const globalFilter = ref('')

const totalUsers = computed(() => users.value.length)
const activeUsers = computed(() => users.value.filter((u) => u.active).length)
const adminUsers = computed(() => users.value.filter((u) => u.role === UserRole.ADMIN).length)

const columns: TableColumn<User>[] = [
  {
    accessorKey: 'fullName',
    header: 'Full name',
    cell: ({ row }) =>
      h('span', { class: 'font-medium text-black' }, row.original.fullName),
  },
  {
    accessorKey: 'username',
    header: 'Username',
    cell: ({ row }) =>
      h('span', { class: 'text-gray-500 font-light' }, row.original.username),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) =>
      h('span', { class: 'text-gray-500 font-light' }, row.original.email ?? '—'),
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) =>
      h(
        'span',
        {
          class:
            row.original.role === UserRole.ADMIN
              ? 'inline-block px-3 py-1 bg-black text-white text-[9px] tracking-[0.3em] uppercase font-normal'
              : 'inline-block px-3 py-1 border border-black text-black text-[9px] tracking-[0.3em] uppercase font-normal',
        },
        row.original.role,
      ),
  },
  {
    accessorKey: 'active',
    header: 'Status',
    cell: ({ row }) =>
      h('span', { class: 'flex items-center gap-2' }, [
        h('span', {
          class: row.original.active
            ? 'w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0'
            : 'w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0',
        }),
        h(
          'span',
          { class: 'text-sm font-light' },
          row.original.active ? 'Active' : 'Inactive',
        ),
      ]),
  },
  {
    accessorKey: 'createdAt',
    header: 'Registration',
    cell: ({ row }) => {
      const date = new Date(row.original.createdAt)
      const formatted = date.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      return h('span', { class: 'text-gray-400 font-light italic' }, formatted)
    },
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
                label: 'View user',
                icon: 'i-lucide-eye',
                onSelect: () => navigateTo(`/users/${row.original.username}`),
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
