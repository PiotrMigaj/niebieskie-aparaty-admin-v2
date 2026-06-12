import type { GalleryItem, GalleryItemStatus } from '../../shared/types/types'

class GalleryItemRepository {
  async findAllForEvent(username: string, eventId: string): Promise<GalleryItem[]> {
    const result = await getDynamoDb().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${username}`,
          ':prefix': `GALLERY_ITEM#${eventId}#`,
        },
      }),
    )
    return (result.Items ?? []).map((i) => this.mapItem(i))
  }

  async deleteByEventId(username: string, eventId: string): Promise<void> {
    const keys: { PK: string; SK: string }[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const result = await getDynamoDb().send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${username}`,
            ':prefix': `GALLERY_ITEM#${eventId}#`,
          },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      for (const item of result.Items ?? []) {
        keys.push({ PK: item.PK as string, SK: item.SK as string })
      }
      exclusiveStartKey = result.LastEvaluatedKey
    } while (exclusiveStartKey)

    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25)
      await getDynamoDb().send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
          },
        }),
      )
    }
  }

  private mapItem(item: Record<string, unknown>): GalleryItem {
    return {
      eventId: item.eventId as string,
      username: item.username as string,
      imageName: item.imageName as string,
      originalFileName: item.originalFileName as string,
      originalObjectKey: item.originalObjectKey as string,
      webpObjectKey: (item.webpObjectKey as string | null) ?? null,
      cloudFrontOriginalUrl: (item.cloudFrontOriginalUrl as string) ?? '',
      cloudFrontWebpUrl: (item.cloudFrontWebpUrl as string) ?? '',
      width: (item.width as number | null) ?? null,
      height: (item.height as number | null) ?? null,
      compressedSize: (item.compressedSize as number | null) ?? null,
      status: (item.status as GalleryItemStatus) ?? 'processed',
      failureReason: (item.failureReason as string | null) ?? null,
      processedAt: item.processedAt as string,
    }
  }
}

export const galleryItemRepository = new GalleryItemRepository()
