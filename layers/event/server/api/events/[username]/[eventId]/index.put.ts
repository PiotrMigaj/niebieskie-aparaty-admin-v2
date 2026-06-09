import { eventRepository } from '../../../../repository/eventRepository'
import { UpdateEventCoverSchema } from '../../../../../shared/types/schemas'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const { imagePlaceholderObjectKey } = await readValidatedBody(event, (b) =>
    UpdateEventCoverSchema.parse(b),
  )

  const existing = await eventRepository.findByUsernameAndEventId(username, eventId)
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  return await eventRepository.updateImagePlaceholder(username, eventId, imagePlaceholderObjectKey)
})
