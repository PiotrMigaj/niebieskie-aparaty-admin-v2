import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!
  const { contentType, extension } = await readBody<{ contentType: string; extension: string }>(event)

  const objectKey = extension ? `${username}/${eventId}/cover.${extension}` : `${username}/${eventId}/cover`
  const { uploadBucketName } = useRuntimeConfig()

  const command = new PutObjectCommand({
    Bucket: uploadBucketName,
    Key: objectKey,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: 300 })
  return { uploadUrl, objectKey }
})
