import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { UploadUrlsSchema } from '../../../../../shared/types/schemas'
import { selectionRepository } from '../../../../repository/selectionRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const body = await readValidatedBody(event, (b) => UploadUrlsSchema.parse(b))

  const selection = await selectionRepository.findByUsernameAndEventId(username, eventId)
  if (!selection) throw createError({ statusCode: 404, message: 'Selection not found' })

  const { selectionOriginalUploadBucketName } = useRuntimeConfig()

  const urls = await Promise.all(
    body.files.map(async ({ filename, contentType }) => {
      const safeName = filename.replace(/^.*[\\/]/, '').replace(/[^\w.-]/g, '_')
      if (!safeName || safeName.startsWith('.')) {
        throw createError({ statusCode: 400, message: `Invalid filename: ${filename}` })
      }
      const url = await getSignedUrl(
        getS3(),
        new PutObjectCommand({
          Bucket: selectionOriginalUploadBucketName,
          Key: `${username}/${eventId}/${safeName}`,
          ContentType: contentType,
        }),
        { expiresIn: 900 },
      )
      return { filename, url }
    }),
  )

  return urls
})
