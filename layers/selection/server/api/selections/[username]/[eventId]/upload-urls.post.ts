import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SelectionUploadUrlsSchema } from '../../../../../shared/types/schemas'
import { eventRepository } from '#layers/event/server/repository/eventRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const body = await readValidatedBody(event, (b) => SelectionUploadUrlsSchema.parse(b))

  const existingEvent = await eventRepository.findByUsernameAndEventId(username, eventId)
  if (!existingEvent) throw createError({ statusCode: 404, message: 'Event not found' })

  const { uploadBucketName } = useRuntimeConfig()

  const urls = await Promise.all(
    body.files.map(async ({ filename, contentType }) => {
      const safeName = toSelectionSafeName(filename)
      if (!safeName) {
        throw createError({ statusCode: 400, message: `Invalid filename: ${filename}` })
      }
      const imageName = safeName
      const objectKey = toSelectionObjectKey(username, eventId, imageName)
      const url = await getSignedUrl(
        getS3(),
        new PutObjectCommand({
          Bucket: uploadBucketName,
          Key: objectKey,
          ContentType: contentType,
        }),
        { expiresIn: 900 },
      )
      return { filename, url, objectKey, imageName }
    }),
  )

  return urls
})
