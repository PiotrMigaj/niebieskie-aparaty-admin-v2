<script setup lang="ts">
definePageMeta({ layout: 'login' })

const { login } = useAuth()
const toast = useToast()
const route = useRoute()
const loading = ref(false)

const providers = [
  {
    label: 'Sign in with Google',
    icon: 'i-logos-google-icon',
    color: 'neutral' as const,
    onClick: () => navigateTo('/auth/google', { external: true }),
  },
]

const fields = [
  {
    name: 'username',
    label: 'Username',
    type: 'text' as const,
    placeholder: 'Enter username',
    required: true,
    autocomplete: 'off',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter password',
    required: true,
    autocomplete: 'new-password',
  },
]

onMounted(() => {
  if (route.query.error === 'unauthorized') {
    toast.add({
      title: 'Access denied',
      description: 'Your email is not allowed to sign in.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  else if (route.query.error === 'oauth') {
    toast.add({
      title: 'Google sign-in failed',
      description: 'An error occurred during Google authentication.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
})

async function onSubmit(data: { username: string; password: string }) {
  loading.value = true
  try {
    await login(data)
  }
  catch {
    toast.add({
      title: 'Login failed',
      description: 'Invalid username or password.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    description="Enter your login and password"
    icon="i-lucide-lock"
    :fields="fields"
    :submit="{ label: 'Login' }"
    :loading="loading"
    :providers="providers"
    @submit="(event) => onSubmit(event.data)"
  />
</template>
