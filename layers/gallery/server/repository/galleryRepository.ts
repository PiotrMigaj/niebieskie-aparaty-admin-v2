import type { CreateGalleryInput } from '../../shared/types/schemas'
import type { Gallery } from '../../shared/types/types'

class GalleryRepository {
  async persist(input: CreateGalleryInput): Promise<Gallery> {
    const galleryId = crypto.randomUUID()
    const now = new Date().toISOString()

    const item = {
      PK: `USER#${input.username}`,
      SK: `GALLERY#${input.eventId}`,
      entityType: 'GALLERY',
      galleryId,
      eventId: input.eventId,
      username: input.username,
      eventTitle: input.eventTitle,
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
        throw createError({ statusCode: 409, message: 'Gallery already exists for this event' })
      }
      throw e
    }

    return this.mapItem(item)
  }

  async findByUsernameAndEventId(username: string, eventId: string): Promise<Gallery | undefined> {
    const result = await getDynamoDb().send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `GALLERY#${eventId}`,
        },
      }),
    )
    if (!result.Item) return undefined
    return this.mapItem(result.Item)
  }

  async updateTotalPhotos(username: string, eventId: string, totalPhotos: number): Promise<Gallery> {
    const now = new Date().toISOString()
    const result = await getDynamoDb().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `GALLERY#${eventId}`,
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

  private mapItem(item: Record<string, unknown>): Gallery {
    return {
      galleryId: item.galleryId as string,
      eventId: item.eventId as string,
      username: item.username as string,
      eventTitle: item.eventTitle as string,
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

export const galleryRepository = new GalleryRepository()
