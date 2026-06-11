import { CreateSelectionSchema } from '../../../shared/types/schemas'
import { selectionRepository } from '../../repository/selectionRepository'
import { selectionItemRepository } from '../../repository/selectionItemRepository'
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

  const selectionRecord = selectionRepository.buildRecord({
    username: body.username,
    eventId: body.eventId,
    eventTitle: body.eventTitle,
    maxNumberOfPhotos: body.maxNumberOfPhotos,
  })

  const seenImageNames = new Set<string>()
  const itemRecords = body.items.map((it) => {
    const safeName = toSelectionSafeName(it.originalFileName)
    if (!safeName) {
      throw createError({ statusCode: 400, message: `Invalid filename: ${it.originalFileName}` })
    }
    const imageName = toSelectionImageName(safeName)
    if (seenImageNames.has(imageName)) {
      throw createError({ statusCode: 422, message: `Duplicate imageName after normalisation: ${imageName}` })
    }
    seenImageNames.add(imageName)
    return selectionItemRepository.buildRecord({
      selectionId: selectionRecord.selectionId,
      eventId: body.eventId,
      username: body.username,
      imageName,
      objectKey: toSelectionObjectKey(body.username, body.eventId, safeName),
      imageWidth: it.imageWidth,
      imageHeight: it.imageHeight,
    })
  })

  try {
    await selectionItemRepository.persistMany(itemRecords)

    await getDynamoDb().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: selectionRecord,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${body.username}`, SK: `EVENT#${body.eventId}` },
              UpdateExpression: 'SET selectionAvailable = :true',
              ConditionExpression: 'attribute_exists(PK)',
              ExpressionAttributeValues: { ':true': true },
            },
          },
        ],
      }),
    )
  } catch (e) {
    if (isError(e)) throw e
    if (e instanceof Error && e.name === 'TransactionCanceledException') {
      throw createError({ statusCode: 409, message: 'A selection already exists for this event' })
    }
    throw createError({ statusCode: 500, message: 'Failed to create selection' })
  }

  return selectionRepository.mapItem(selectionRecord as unknown as Record<string, unknown>)
})
