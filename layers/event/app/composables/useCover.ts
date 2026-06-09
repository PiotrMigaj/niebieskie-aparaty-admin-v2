export function useCover(
  username: string,
  eventId: string,
  imagePlaceholderObjectKey: Ref<string | undefined>,
  onRefreshEvent: () => Promise<void>,
) {
  const coverUrl = ref<string | null>(null)
  const selectedFile = ref<File | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  const uploading = ref(false)
  const uploadError = ref<string | null>(null)

  async function fetchCoverUrl() {
    try {
      const { viewUrl } = await $fetch<{ viewUrl: string }>(
        `/api/events/${username}/${eventId}/cover`,
      )
      coverUrl.value = viewUrl
    } catch {
      coverUrl.value = null
    }
  }

  watch(
    imagePlaceholderObjectKey,
    (key) => {
      if (key) fetchCoverUrl()
    },
    { immediate: true },
  )

  function onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement
    selectedFile.value = input.files?.[0] ?? null
  }

  function clearFile() {
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
  }

  async function uploadCover() {
    const file = selectedFile.value
    if (!file) return

    uploading.value = true
    uploadError.value = null

    try {
      const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
      const { uploadUrl, objectKey } = await $fetch<{ uploadUrl: string; objectKey: string }>(
        `/api/events/${username}/${eventId}/cover`,
        { method: 'POST', body: { contentType: file.type, extension } },
      )

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      await $fetch(`/api/events/${username}/${eventId}`, {
        method: 'PUT',
        body: { imagePlaceholderObjectKey: objectKey },
      })

      await onRefreshEvent()
      await fetchCoverUrl()
      clearFile()
    } catch {
      uploadError.value = 'Upload failed. Please try again.'
    } finally {
      uploading.value = false
    }
  }

  return { coverUrl, selectedFile, fileInput, uploading, uploadError, onFileChange, uploadCover }
}
