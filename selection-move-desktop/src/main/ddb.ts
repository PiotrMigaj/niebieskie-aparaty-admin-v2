import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { Credentials } from './credentials'

export interface Selection {
  selectionId: string
  eventId: string
  username: string
  eventTitle: string
  blocked: boolean
  maxNumberOfPhotos: number
  selectedNumberOfPhotos: number
  selectedImages: string[]
  createdAt: string
  updatedAt: string
}

export async function listSelections(creds: Credentials): Promise<Selection[]> {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  }))

  const results: Selection[] = []
  let lastKey: Record<string, unknown> | undefined

  do {
    const res = await client.send(new QueryCommand({
      TableName: creds.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'ENTITY#SELECTION' },
      ExclusiveStartKey: lastKey as Record<string, never> | undefined,
    }))

    for (const item of res.Items ?? []) {
      results.push({
        selectionId: item.selectionId,
        eventId: item.eventId,
        username: item.username,
        eventTitle: item.eventTitle,
        blocked: Boolean(item.blocked),
        maxNumberOfPhotos: Number(item.maxNumberOfPhotos ?? 0),
        selectedNumberOfPhotos: Number(item.selectedNumberOfPhotos ?? 0),
        selectedImages: Array.isArray(item.selectedImages) ? item.selectedImages : [],
        createdAt: item.createdAt ?? '',
        updatedAt: item.updatedAt ?? '',
      })
    }

    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return results
}
