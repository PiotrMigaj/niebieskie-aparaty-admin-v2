import { CreateSelectionSchema } from '../../../shared/types/schemas'
import { selectionRepository } from '../../repository/selectionRepository'
import { userRepository } from '#layers/user/server/repository/userRepository'
import { eventRepository } from '#layers/event/server/repository/eventRepository'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => CreateSelectionSchema.parse(b))

  const user = await userRepository.findByUsername(body.username)
  if (!user) throw createError({ statusCode: 404, message: `User: ${body.username} not found` })

  const existingEvent = await eventRepository.findByUsernameAndEventId(body.username, body.eventId)
  if (!existingEvent) throw createError({ statusCode: 404, message: 'Event not found' })
  if (existingEvent.title !== body.eventTitle) {
    throw createError({ statusCode: 422, message: 'Event title mismatch' })
  }

  const existingSelection = await selectionRepository.findByUsernameAndEventId(body.username, body.eventId)
  if (existingSelection) {
    throw createError({ statusCode: 409, message: 'A selection already exists for this event' })
  }

  try {
    return await selectionRepository.persist(body)
  } catch (e) {
    if (isError(e)) throw e
    throw createError({ statusCode: 500, message: 'Failed to create selection' })
  }
})
