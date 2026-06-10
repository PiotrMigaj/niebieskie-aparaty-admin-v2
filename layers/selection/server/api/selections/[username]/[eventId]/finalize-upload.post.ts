import { FinalizeUploadSchema } from '../../../../../shared/types/schemas'
import { selectionRepository } from '../../../../repository/selectionRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const body = await readValidatedBody(event, (b) => FinalizeUploadSchema.parse(b))

  const selection = await selectionRepository.findByUsernameAndEventId(username, eventId)
  if (!selection) throw createError({ statusCode: 404, message: 'Selection not found' })

  try {
    const updated = await selectionRepository.updateTotalPhotos(username, eventId, body.totalPhotos)
    await tryEnqueueFinalize(username, eventId, updated)
    return updated
  } catch (e) {
    if (isError(e)) throw e
    throw createError({ statusCode: 500, message: 'Failed to finalize upload' })
  }
})
