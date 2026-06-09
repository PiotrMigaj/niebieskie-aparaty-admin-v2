<script setup lang="ts">
import { CreateUserSchema, type CreateUserInput } from '../../shared/schemas'

const open = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const state = reactive<Partial<CreateUserInput>>({
  fullName: '',
  username: '',
  email: '',
  password: '', 
})

const { addUser } = useUser()

function clearError() {
  errorMessage.value = null
}

function resetForm() {
  state.fullName = ''
  state.username = ''
  state.email = ''
  state.password = ''
  errorMessage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})

async function onSubmit() {
  loading.value = true
  errorMessage.value = null
  try {
    const created = await addUser(state as CreateUserInput)
    open.value = false
    await navigateTo(`/users/${created.username}`)
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
    errorMessage.value =
      err?.data?.message ??
      err?.statusMessage ??
      err?.message ??
      'Failed to create user'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Add user">
    <UButton
      label="Add user"
      color="neutral"
      variant="solid"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <UForm
        id="add-user-form"
        :schema="CreateUserSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't create user"
          :description="errorMessage"
          :close="{ onClick: clearError }"
        />

        <UFormField label="Full name" name="fullName" required>
          <UInput
            v-model="state.fullName"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Username" name="username" required>
          <UInput
            v-model="state.username"
            autocomplete="off"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Email" name="email">
          <UInput
            v-model="state.email"
            type="email"
            :ui="{ base: 'rounded-none' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Password" name="password" required>
          <UInput
            v-model="state.password"
            autocomplete="off"
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
          form="add-user-form"
          label="Add"
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
