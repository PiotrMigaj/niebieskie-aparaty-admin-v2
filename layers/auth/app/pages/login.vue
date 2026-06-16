<script setup lang="ts">
import { LoginSchema, type LoginInput } from '#layers/auth/shared/types/schemas'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'login' })

const state = reactive<Partial<LoginInput>>({
  username: undefined,
  password: undefined,
})
const { login } = useAuth()
const errorMessage = ref<string | null>(null)
const loading = ref(false)
const showPassword = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  errorMessage.value = null
  loading.value = true
  try {
    await login(event.data)
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    errorMessage.value = statusCode === 401 ? 'Invalid username or password' : 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="LoginSchema" :state="state" class="space-y-4" @submit="onSubmit">
    <UAlert v-if="errorMessage" color="error" variant="soft" :title="errorMessage" :close="{ onClick: () => { errorMessage = null } }" />
    <p class="text-center text-sm text-[#888] -mt-2 mb-2">Enter your login and password</p>
    <UFormField name="username">
      <UInput v-model="state.username" placeholder="Login" autocomplete="username" class="w-full" size="lg" />
    </UFormField>
    <UFormField name="password">
      <UInput
        v-model="state.password"
        :type="showPassword ? 'text' : 'password'"
        placeholder="Password"
        autocomplete="current-password"
        class="w-full"
        size="lg"
      >
        <template #trailing>
          <button type="button" class="flex items-center text-[#aaa] hover:text-[#555] transition-colors" @click="showPassword = !showPassword">
            <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="w-4 h-4" />
          </button>
        </template>
      </UInput>
    </UFormField>
    <UButton type="submit" block :loading="loading" size="lg" class="uppercase tracking-[3px] mt-2">
      Login
    </UButton>
  </UForm>
</template>
