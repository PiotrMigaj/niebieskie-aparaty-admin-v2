import { CreateGallerySchema } from '../../../shared/types/schemas'
import { galleryRepository } from '../../repository/galleryRepository'
import { userRepository } from '#layers/user/server/repository/userRepository'
import { eventRepository } from '#layers/event/server/repository/eventRepository'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => CreateGallerySchema.parse(b))

  const user = await userRepository.findByUsername(body.username)
  if (!user) throw createError({ statusCode: 404, message: `User: ${body.username} not found` })

  const existingEvent = await eventRepository.findByUsernameAndEventId(body.username, body.eventId)
  if (!existingEvent) throw createError({ statusCode: 404, message: 'Event not found' })
  if (existingEvent.title !== body.eventTitle) {
    throw createError({ statusCode: 422, message: 'Event title mismatch' })
  }

  const existingGallery = await galleryRepository.findByUsernameAndEventId(body.username, body.eventId)
  if (existingGallery) {
    throw createError({ statusCode: 409, message: 'A gallery already exists for this event' })
  }

  try {
    return await galleryRepository.persist(body)
  } catch (e) {
    if (isError(e)) throw e
    throw createError({ statusCode: 500, message: 'Failed to create gallery' })
  }
})
