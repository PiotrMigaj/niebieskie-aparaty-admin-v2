<script setup lang="ts">
const props = defineProps<{ username: string; active: boolean }>()
const emit = defineEmits<{ toggled: [] }>()

const open = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const { toggleStatus } = useUser()

const title = computed(() => props.active ? 'Deactivate user' : 'Activate user')
const warningMessage = computed(() =>
  props.active
    ? `@${props.username} will no longer be able to access the platform.`
    : `@${props.username} will regain access to the platform.`,
)

function clearError() {
  errorMessage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) errorMessage.value = null
})

async function onConfirm() {
  loading.value = true
  errorMessage.value = null
  try {
    await toggleStatus(props.username, !props.active)
    open.value = false
    emit('toggled')
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
    errorMessage.value =
      err?.data?.message ??
      err?.statusMessage ??
      err?.message ??
      'Failed to update user status'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <UButton
      :label="active ? 'Deactivate' : 'Activate'"
      icon="i-lucide-power"
      color="neutral"
      variant="ghost"
      class="text-[10px] tracking-[0.25em] uppercase"
    />

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Action failed"
          :description="errorMessage"
          :close="{ onClick: clearError }"
        />
        <UAlert
          :color="active ? 'warning' : 'info'"
          variant="subtle"
          :icon="active ? 'i-lucide-alert-triangle' : 'i-lucide-info'"
          :title="title"
          :description="warningMessage"
        />
      </div>
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
          label="Confirm"
          color="neutral"
          variant="solid"
          class="text-[10px] tracking-[0.25em] uppercase"
          :loading="loading"
          :disabled="loading"
          @click="onConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
