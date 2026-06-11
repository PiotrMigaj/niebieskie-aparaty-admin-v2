import type { SelectionItem } from '../../shared/types/types'

export interface SelectionItemRecord {
  PK: string
  SK: string
  entityType: 'SELECTION_ITEM'
  selectionId: string
  eventId: string
  username: string
  imageName: string
  objectKey: string
  imageWidth: number
  imageHeight: number
  selected: boolean
}

interface BuildArgs {
  selectionId: string
  eventId: string
  username: string
  imageName: string
  objectKey: string
  imageWidth: number
  imageHeight: number
}

class SelectionItemRepository {
  buildRecord({ selectionId, eventId, username, imageName, objectKey, imageWidth, imageHeight }: BuildArgs): SelectionItemRecord {
    return {
      PK: `USER#${username}`,
      SK: `SELECTION_ITEM#${eventId}#${imageName}`,
      entityType: 'SELECTION_ITEM',
      selectionId,
      eventId,
      username,
      imageName,
      objectKey,
      imageWidth,
      imageHeight,
      selected: false,
    }
  }

  async persistMany(records: SelectionItemRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += 25) {
      const chunk = records.slice(i, i + 25)
      await getDynamoDb().send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: chunk.map((Item) => ({ PutRequest: { Item } })),
          },
        }),
      )
    }
  }

  mapItem(item: Record<string, unknown>): SelectionItem {
    return {
      imageName: item.imageName as string,
      selectionId: item.selectionId as string,
      eventId: item.eventId as string,
      username: item.username as string,
      objectKey: item.objectKey as string,
      imageWidth: (item.imageWidth as number) ?? 0,
      imageHeight: (item.imageHeight as number) ?? 0,
      selected: (item.selected as boolean) ?? false,
    }
  }
}

export const selectionItemRepository = new SelectionItemRepository()
