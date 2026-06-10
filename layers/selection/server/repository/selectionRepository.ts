import type { CreateSelectionInput } from '../../shared/types/schemas'
import type { Selection } from '../../shared/types/types'

class SelectionRepository {
  async persist(input: CreateSelectionInput): Promise<Selection> {
    const selectionId = crypto.randomUUID()
    const now = new Date().toISOString()

    const item = {
      PK: `USER#${input.username}`,
      SK: `SELECTION#${input.eventId}`,
      entityType: 'SELECTION',
      selectionId,
      eventId: input.eventId,
      username: input.username,
      eventTitle: input.eventTitle,
      blocked: false,
      maxNumberOfPhotos: input.maxNumberOfPhotos,
      selectedNumberOfPhotos: 0,
      isUploaded: false,
      totalPhotos: null,
      processedSuccessPhotos: 0,
      processedFailedPhotos: 0,
      finalizeEnqueued: false,
      uploadStartedAt: now,
      uploadCompletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await getDynamoDb().send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
    } catch (e) {
      if (!(e instanceof Error)) throw e
      if (e.name === 'ConditionalCheckFailedException') {
        throw createError({ statusCode: 409, message: 'Selection already exists for this event' })
      }
      throw e
    }

    return this.mapItem(item)
  }

  async findByUsernameAndEventId(username: string, eventId: string): Promise<Selection | undefined> {
    const result = await getDynamoDb().send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `SELECTION#${eventId}`,
        },
      }),
    )
    if (!result.Item) return undefined
    return this.mapItem(result.Item)
  }

  async updateTotalPhotos(username: string, eventId: string, totalPhotos: number): Promise<Selection> {
    const now = new Date().toISOString()
    const result = await getDynamoDb().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `SELECTION#${eventId}`,
        },
        UpdateExpression: 'SET totalPhotos = :n, updatedAt = :now',
        ExpressionAttributeValues: {
          ':n': totalPhotos,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return this.mapItem(result.Attributes as Record<string, unknown>)
  }

  private mapItem(item: Record<string, unknown>): Selection {
    return {
      selectionId: item.selectionId as string,
      eventId: item.eventId as string,
      username: item.username as string,
      eventTitle: item.eventTitle as string,
      blocked: item.blocked as boolean,
      maxNumberOfPhotos: item.maxNumberOfPhotos as number,
      selectedNumberOfPhotos: item.selectedNumberOfPhotos as number,
      isUploaded: (item.isUploaded as boolean) ?? false,
      totalPhotos: (item.totalPhotos as number | null) ?? null,
      processedSuccessPhotos: (item.processedSuccessPhotos as number) ?? 0,
      processedFailedPhotos: (item.processedFailedPhotos as number) ?? 0,
      uploadStartedAt: (item.uploadStartedAt as string | null) ?? null,
      uploadCompletedAt: (item.uploadCompletedAt as string | null) ?? null,
      createdAt: new Date(item.createdAt as string),
      updatedAt: new Date(item.updatedAt as string),
    }
  }
}

export const selectionRepository = new SelectionRepository()
