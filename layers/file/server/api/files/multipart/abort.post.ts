import { z } from 'zod'

const AbortSchema = z.object({
  uploadId: z.string().min(1),
  objectKey: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => AbortSchema.parse(b))
  const { uploadBucketName } = useRuntimeConfig()

  try {
    await getS3().send(
      new AbortMultipartUploadCommand({
        Bucket: uploadBucketName,
        Key: body.objectKey,
        UploadId: body.uploadId,
      }),
    )
  } catch {
    // best-effort: the upload may already be cleaned up
  }

  return { ok: true }
})
