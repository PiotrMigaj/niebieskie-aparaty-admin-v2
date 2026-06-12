import type { Selection } from '#layers/selection/shared/types/types'

export interface UploadFile {
  file: File
  status: 'pending' | 'measuring' | 'uploading' | 'done' | 'failed'
  loaded: number
  width: number
  height: number
  imageName: string
  error: string | null
}

interface PresignedUrl {
  filename: string
  url: string
  objectKey: string
  imageName: string
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

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const out = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 }
      URL.revokeObjectURL(url)
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}

export function useSelectionUpload(username: string, eventId: string, eventTitle: string) {
  const files = ref<UploadFile[]>([])
  const isUploading = ref(false)
  const uploadError = ref<string | null>(null)
  const maxNumberOfPhotos = ref<string>('')

  const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.file.size, 0))
  const uploadedBytes = computed(() => files.value.reduce((sum, f) => sum + f.loaded, 0))
  const overallProgress = computed(() =>
    totalBytes.value > 0 ? uploadedBytes.value / totalBytes.value : 0,
  )

  function addFiles(fileList: FileList) {
    const existing = new Set(files.value.map((f) => f.file.name))
    for (const file of fileList) {
      if (!existing.has(file.name)) {
        files.value.push({
          file,
          status: 'pending',
          loaded: 0,
          width: 0,
          height: 0,
          imageName: '',
          error: null,
        })
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
    maxNumberOfPhotos.value = ''
  }

  async function startUpload(): Promise<{ ok: boolean; selection?: Selection }> {
    const max = parseInt(maxNumberOfPhotos.value, 10)
    if (isNaN(max) || max < 1 || max > 1000) {
      uploadError.value = 'Max photos must be between 1 and 1000'
      return { ok: false }
    }
    const pending = files.value.filter((f) => f.status === 'pending')
    if (pending.length === 0) {
      uploadError.value = 'Add at least one image'
      return { ok: false }
    }

    isUploading.value = true
    uploadError.value = null

    let presignedUrls: PresignedUrl[]
    try {
      presignedUrls = await $fetch<PresignedUrl[]>(
        `/api/selections/${username}/${eventId}/upload-urls`,
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
      return { ok: false }
    }

    const urlMap = new Map(presignedUrls.map((p) => [p.filename, p]))

    let cursor = 0
    const workers = Array.from({ length: 4 }, async () => {
      while (cursor < pending.length) {
        const idx = cursor++
        const entry = pending[idx]
        if (!entry) continue
        const presigned = urlMap.get(entry.file.name)
        if (!presigned) {
          entry.status = 'failed'
          entry.error = 'No presigned URL received'
          continue
        }
        entry.imageName = presigned.imageName
        entry.status = 'measuring'
        const dims = await readImageDimensions(entry.file)
        entry.width = dims.width
        entry.height = dims.height
        entry.status = 'uploading'
        try {
          await xhrPut(presigned.url, entry.file, (loaded) => {
            entry.loaded = loaded
          })
          entry.loaded = entry.file.size
          entry.status = 'done'
        } catch (e: unknown) {
          entry.status = 'failed'
          entry.error = e instanceof Error ? e.message : 'Upload failed'
        }
      }
    })

    await Promise.all(workers)

    const uploaded = pending.filter((f) => f.status === 'done')
    const failed = pending.length - uploaded.length

    if (failed > 0) {
      uploadError.value = `${failed} file${failed !== 1 ? 's' : ''} failed to upload. Remove them or retry.`
      isUploading.value = false
      return { ok: false }
    }

    try {
      const selection = await $fetch<Selection>('/api/selections', {
        method: 'POST',
        body: {
          username,
          eventId,
          eventTitle,
          maxNumberOfPhotos: max,
          items: uploaded.map((f) => ({
            originalFileName: f.file.name,
            imageName: f.imageName,
            imageWidth: f.width,
            imageHeight: f.height,
          })),
        },
      })
      isUploading.value = false
      return { ok: true, selection }
    } catch (e: unknown) {
      const err = e as { status?: number; data?: { message?: string }; message?: string }
      if (err?.status === 409) {
        uploadError.value = 'A selection already exists for this event'
      } else {
        uploadError.value = err?.data?.message ?? err?.message ?? 'Failed to create selection'
      }
      isUploading.value = false
      return { ok: false }
    }
  }

  return {
    files,
    maxNumberOfPhotos,
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
