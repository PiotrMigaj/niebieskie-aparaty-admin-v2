import type { File as FileEntity } from '#layers/file/shared/types'

const PART_SIZE = 5 * 1024 * 1024

type StartResponse = {
  uploadId: string
  objectKey: string
  partUrls: string[]
}

type CompletedPart = { PartNumber: number; ETag: string }

function putPart(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')
        if (!etag) {
          reject(new Error('Missing ETag header — check S3 bucket CORS (ExposeHeaders).'))
          return
        }
        resolve(etag)
      } else {
        reject(new Error(`Part upload failed (HTTP ${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during part upload'))
    xhr.send(blob)
  })
}

export function useMultipartUpload(
  username: string,
  eventId: string,
  onUploaded: () => void | Promise<void>,
) {
  const selectedFile = ref<File | null>(null)
  const description = ref('')
  const uploading = ref(false)
  const uploadedBytes = ref(0)
  const totalBytes = ref(0)
  const uploadError = ref<string | null>(null)

  const progress = computed(() =>
    totalBytes.value ? uploadedBytes.value / totalBytes.value : 0,
  )

  function onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement
    selectedFile.value = input.files?.[0] ?? null
  }

  function clearFile() {
    selectedFile.value = null
  }

  function reset() {
    selectedFile.value = null
    description.value = ''
    uploading.value = false
    uploadedBytes.value = 0
    totalBytes.value = 0
    uploadError.value = null
  }

  async function upload() {
    const file = selectedFile.value
    if (!file) return
    if (!description.value.trim()) return

    uploading.value = true
    uploadError.value = null
    uploadedBytes.value = 0
    totalBytes.value = file.size

    let started: StartResponse | null = null

    try {
      started = await $fetch<StartResponse>('/api/files/multipart/start', {
        method: 'POST',
        body: {
          username,
          eventId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          partSize: PART_SIZE,
        },
      })

      const completedBytesPerPart: number[] = new Array(started.partUrls.length).fill(0)
      const parts: CompletedPart[] = []

      for (let i = 0; i < started.partUrls.length; i++) {
        const start = i * PART_SIZE
        const end = Math.min(start + PART_SIZE, file.size)
        const blob = file.slice(start, end)

        const etag = await putPart(started.partUrls[i]!, blob, (loaded) => {
          completedBytesPerPart[i] = loaded
          uploadedBytes.value = completedBytesPerPart.reduce((a, b) => a + b, 0)
        })

        completedBytesPerPart[i] = blob.size
        uploadedBytes.value = completedBytesPerPart.reduce((a, b) => a + b, 0)
        parts.push({ PartNumber: i + 1, ETag: etag })
      }

      await $fetch('/api/files/multipart/complete', {
        method: 'POST',
        body: {
          uploadId: started.uploadId,
          objectKey: started.objectKey,
          parts,
        },
      })

      await $fetch<FileEntity>('/api/files', {
        method: 'POST',
        body: {
          username,
          eventId,
          objectKey: started.objectKey,
          description: description.value.trim(),
        },
      })

      await onUploaded()
      reset()
    } catch (e: unknown) {
      if (started) {
        try {
          await $fetch('/api/files/multipart/abort', {
            method: 'POST',
            body: { uploadId: started.uploadId, objectKey: started.objectKey },
          })
        } catch {
          // best-effort
        }
      }
      const err = e as { data?: { message?: string }; statusMessage?: string; message?: string }
      uploadError.value =
        err?.data?.message ?? err?.statusMessage ?? err?.message ?? 'Upload failed'
      uploading.value = false
    }
  }

  return {
    selectedFile,
    description,
    uploading,
    uploadedBytes,
    totalBytes,
    progress,
    uploadError,
    onFileChange,
    clearFile,
    reset,
    upload,
  }
}
