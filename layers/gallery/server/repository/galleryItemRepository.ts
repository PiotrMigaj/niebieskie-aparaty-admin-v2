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

  private mapItem(item: Record<string, unknown>): GalleryItem {
    return {
      eventId: item.eventId as string,
      username: item.username as string,
      imageName: item.imageName as string,
      originalFileName: item.originalFileName as string,
      originalObjectKey: item.originalObjectKey as string,
      webpObjectKey: (item.webpObjectKey as string | null) ?? null,
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
