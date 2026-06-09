import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { eventRepository } from '~~/layers/event/server/repository/eventRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const ev = await eventRepository.findByUsernameAndEventId(username, eventId)
  if (!ev) throw createError({ statusCode: 404, message: 'Event not found' })
  if (!ev.imagePlaceholderObjectKey) throw createError({ statusCode: 404, message: 'No cover image' })

  const { uploadBucketName } = useRuntimeConfig()

  const command = new GetObjectCommand({
    Bucket: uploadBucketName,
    Key: ev.imagePlaceholderObjectKey,
  })

  const viewUrl = await getSignedUrl(getS3(), command, { expiresIn: 3600 })
  return { viewUrl }
})
