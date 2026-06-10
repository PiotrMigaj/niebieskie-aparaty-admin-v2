import { GalleryFinalizeUploadSchema } from '../../../../../shared/types/schemas'
import { galleryRepository } from '../../../../repository/galleryRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const body = await readValidatedBody(event, (b) => GalleryFinalizeUploadSchema.parse(b))

  const gallery = await galleryRepository.findByUsernameAndEventId(username, eventId)
  if (!gallery) throw createError({ statusCode: 404, message: 'Gallery not found' })

  try {
    const updated = await galleryRepository.updateTotalPhotos(username, eventId, body.totalPhotos)
    await tryEnqueueFinalizeGallery(username, eventId, updated)
    return updated
  } catch (e) {
    if (isError(e)) throw e
    throw createError({ statusCode: 500, message: 'Failed to finalize upload' })
  }
})
