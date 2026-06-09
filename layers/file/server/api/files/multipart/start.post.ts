import { z } from 'zod'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { userRepository } from '#layers/user/server/repository/userRepository'

const StartSchema = z.object({
  username: z.string().min(1),
  eventId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
  partSize: z.number().int().positive(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => StartSchema.parse(b))

  const user = await userRepository.findByUsername(body.username)
  if (!user) throw createError({ statusCode: 404, message: `User: ${body.username} not found` })

  const { uploadBucketName } = useRuntimeConfig()
  const objectKey = `${body.username}/${body.eventId}/${body.filename}`

  const created = await getS3().send(
    new CreateMultipartUploadCommand({
      Bucket: uploadBucketName,
      Key: objectKey,
      ContentType: body.contentType,
    }),
  )

  const uploadId = created.UploadId
  if (!uploadId) throw createError({ statusCode: 500, message: 'Failed to start multipart upload' })

  const partCount = Math.ceil(body.fileSize / body.partSize)
  const partUrls: string[] = []
  for (let i = 1; i <= partCount; i++) {
    const url = await getSignedUrl(
      getS3(),
      new UploadPartCommand({
        Bucket: uploadBucketName,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: i,
      }),
      { expiresIn: 3600 },
    )
    partUrls.push(url)
  }

  return { uploadId, objectKey, partUrls }
})
