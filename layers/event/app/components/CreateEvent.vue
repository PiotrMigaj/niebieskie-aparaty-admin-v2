<script setup lang="ts">
import { CreateEventSchema, type CreateEventInput } from '#layers/event/shared/types/schemas'
import type { Event as AppEvent } from '#layers/event/shared/types/types'

const props = defineProps<{ username: string }>()

const open = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const state = reactive<Partial<CreateEventInput>>({
  username: props.username,
  title: '',
  date: '',
  description: '',
})

const { createEvent } = useEvent()

function clearError() {
  errorMessage.value = null
}

function resetForm() {
  state.username = props.username
  state.title = ''
  state.date = ''
  state.description = ''
  errorMessage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})

async function onSubmit() {
  loading.value = true
  errorMessage.value = null
  try {
    const created = await createEvent(state as CreateEventInput) as unknown as AppEvent
    open.value = false
    await navigateTo(`/users/${props.username}/events/${created.eventId}`)
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
    errorMessage.value =
      err?.data?.message ??
      err?.statusMessage ??
      err?.message ??
      'Failed to create event'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Create event">
    <UButton
      label="Create event"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <UForm
        id="create-event-form"
        :schema="CreateEventSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't create event"
          :description="errorMessage"
          :close="{ onClick: clearError }"
        />

        <UFormField label="Username" name="username">
          <UInput
            v-model="state.username"
            disabled
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Title" name="title" required>
          <UInput
            v-model="state.title"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Date" name="date" required>
          <UInput
            v-model="state.date"
            type="date"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Description" name="description">
          <UTextarea
            v-model="state.description"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>
      </UForm>
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
          form="create-event-form"
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
