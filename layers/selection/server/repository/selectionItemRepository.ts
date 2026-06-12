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
  cloudFrontUrl: string
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
  cloudFrontUrl: string
  imageWidth: number
  imageHeight: number
}

class SelectionItemRepository {
  buildRecord({ selectionId, eventId, username, imageName, objectKey, cloudFrontUrl, imageWidth, imageHeight }: BuildArgs): SelectionItemRecord {
    return {
      PK: `USER#${username}`,
      SK: `SELECTION_ITEM#${eventId}#${imageName}`,
      entityType: 'SELECTION_ITEM',
      selectionId,
      eventId,
      username,
      imageName,
      objectKey,
      cloudFrontUrl,
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
            ':prefix': `SELECTION_ITEM#${eventId}#`,
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

  mapItem(item: Record<string, unknown>): SelectionItem {
    return {
      imageName: item.imageName as string,
      selectionId: item.selectionId as string,
      eventId: item.eventId as string,
      username: item.username as string,
      objectKey: item.objectKey as string,
      cloudFrontUrl: (item.cloudFrontUrl as string) ?? '',
      imageWidth: (item.imageWidth as number) ?? 0,
      imageHeight: (item.imageHeight as number) ?? 0,
      selected: (item.selected as boolean) ?? false,
    }
  }
}

export const selectionItemRepository = new SelectionItemRepository()
