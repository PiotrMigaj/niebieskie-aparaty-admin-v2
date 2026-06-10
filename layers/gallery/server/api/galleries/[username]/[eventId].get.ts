import { galleryRepository } from '../../../repository/galleryRepository'
import { galleryItemRepository } from '../../../repository/galleryItemRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const gallery = await galleryRepository.findByUsernameAndEventId(username, eventId)
  if (!gallery) throw createError({ statusCode: 404, message: 'Gallery not found' })

  const include = getQuery(event).include
  if (include === 'items') {
    const items = await galleryItemRepository.findAllForEvent(username, eventId)
    return { ...gallery, items }
  }

  return gallery
})
