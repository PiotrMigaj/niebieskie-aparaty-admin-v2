export interface UploadFile {
  file: File
  status: 'pending' | 'uploading' | 'done' | 'failed'
  loaded: number
  error: string | null
}

function xhrPut(url: string, file: File, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Request timed out'))
    xhr.send(file)
  })
}

export function useGalleryUpload(username: string, eventId: string) {
  const files = ref<UploadFile[]>([])
  const isUploading = ref(false)
  const uploadError = ref<string | null>(null)

  const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.file.size, 0))
  const uploadedBytes = computed(() => files.value.reduce((sum, f) => sum + f.loaded, 0))
  const overallProgress = computed(() =>
    totalBytes.value > 0 ? uploadedBytes.value / totalBytes.value : 0,
  )

  function addFiles(fileList: FileList) {
    const existing = new Set(files.value.map((f) => f.file.name))
    for (const file of fileList) {
      if (!existing.has(file.name)) {
        files.value.push({ file, status: 'pending', loaded: 0, error: null })
        existing.add(file.name)
      }
    }
  }

  function removeFile(name: string) {
    files.value = files.value.filter((f) => f.file.name !== name || f.status !== 'pending')
  }

  function reset() {
    files.value = []
    isUploading.value = false
    uploadError.value = null
  }

  async function startUpload(): Promise<{ ok: number; failed: number }> {
    isUploading.value = true
    uploadError.value = null

    const pending = files.value.filter((f) => f.status === 'pending')

    let presignedUrls: Array<{ filename: string; url: string }>
    try {
      presignedUrls = await $fetch<Array<{ filename: string; url: string }>>(
        `/api/galleries/${username}/${eventId}/upload-urls`,
        {
          method: 'POST',
          body: {
            files: pending.map((f) => ({
              filename: f.file.name,
              contentType: f.file.type || 'application/octet-stream',
              size: f.file.size,
            })),
          },
        },
      )
    } catch (e: unknown) {
      const err = e as { data?: { message?: string }; message?: string }
      uploadError.value = err?.data?.message ?? err?.message ?? 'Failed to get upload URLs'
      isUploading.value = false
      return { ok: 0, failed: pending.length }
    }

    const urlMap = new Map(presignedUrls.map((p) => [p.filename, p.url]))

    let cursor = 0
    let ok = 0
    let failed = 0

    const workers = Array.from({ length: 4 }, async () => {
      while (cursor < pending.length) {
        const idx = cursor++
        const entry = pending[idx]
        if (!entry) continue
        const url = urlMap.get(entry.file.name)
        if (!url) {
          entry.status = 'failed'
          entry.error = 'No presigned URL received'
          failed++
          continue
        }
        entry.status = 'uploading'
        try {
          await xhrPut(url, entry.file, (loaded) => {
            entry.loaded = loaded
          })
          entry.loaded = entry.file.size
          entry.status = 'done'
          ok++
        } catch (e: unknown) {
          entry.status = 'failed'
          entry.error = e instanceof Error ? e.message : 'Upload failed'
          failed++
        }
      }
    })

    await Promise.all(workers)

    try {
      await $fetch(`/api/galleries/${username}/${eventId}/finalize-upload`, {
        method: 'POST',
        body: { totalPhotos: ok },
      })
    } catch {
      uploadError.value = 'Upload complete but failed to record count — please contact support'
    }

    isUploading.value = false
    return { ok, failed }
  }

  return {
    files,
    isUploading,
    uploadError,
    totalBytes,
    uploadedBytes,
    overallProgress,
    addFiles,
    removeFile,
    reset,
    startUpload,
  }
}
