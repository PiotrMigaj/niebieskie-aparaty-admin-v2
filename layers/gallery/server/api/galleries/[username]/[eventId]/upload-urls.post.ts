import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GalleryUploadUrlsSchema } from '../../../../../shared/types/schemas'
import { galleryRepository } from '../../../../repository/galleryRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const body = await readValidatedBody(event, (b) => GalleryUploadUrlsSchema.parse(b))

  const gallery = await galleryRepository.findByUsernameAndEventId(username, eventId)
  if (!gallery) throw createError({ statusCode: 404, message: 'Gallery not found' })

  const { galleryUploadBucketName } = useRuntimeConfig()

  const urls = await Promise.all(
    body.files.map(async ({ filename, contentType }) => {
      const safeName = filename.replace(/^.*[\\/]/, '').replace(/[^\w.-]/g, '_')
      if (!safeName || safeName.startsWith('.')) {
        throw createError({ statusCode: 400, message: `Invalid filename: ${filename}` })
      }
      const url = await getSignedUrl(
        getS3(),
        new PutObjectCommand({
          Bucket: galleryUploadBucketName,
          Key: `${username}/${eventId}/original/${safeName}`,
          ContentType: contentType,
        }),
        { expiresIn: 900 },
      )
      return { filename, url }
    }),
  )

  return urls
})
