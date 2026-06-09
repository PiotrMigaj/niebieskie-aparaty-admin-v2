import { z } from 'zod'

const CompleteSchema = z.object({
  uploadId: z.string().min(1),
  objectKey: z.string().min(1),
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().positive(),
        ETag: z.string().min(1),
      }),
    )
    .min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => CompleteSchema.parse(b))
  const { uploadBucketName } = useRuntimeConfig()

  await getS3().send(
    new CompleteMultipartUploadCommand({
      Bucket: uploadBucketName,
      Key: body.objectKey,
      UploadId: body.uploadId,
      MultipartUpload: { Parts: body.parts },
    }),
  )

  return { ok: true }
})
