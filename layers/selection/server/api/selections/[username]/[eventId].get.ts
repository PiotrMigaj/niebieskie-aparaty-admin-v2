import { selectionRepository } from '../../../repository/selectionRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const selection = await selectionRepository.findByUsernameAndEventId(username, eventId)
  if (!selection) throw createError({ statusCode: 404, message: 'Selection not found' })

  return selection
})
