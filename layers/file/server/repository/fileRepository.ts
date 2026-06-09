import type { CreateFileInput } from '../../shared/schemas'
import type { File } from '../../shared/types'

class FileRepository {
  async persist(input: CreateFileInput): Promise<File> {
    const fileId = crypto.randomUUID()
    const now = new Date().toISOString()

    const item = {
      PK: `USER#${input.username}`,
      SK: `FILE#${input.eventId}#${fileId}`,
      entityType: 'FILE',
      fileId,
      eventId: input.eventId,
      username: input.username,
      objectKey: input.objectKey,
      description: input.description,
      createdAt: now,
    }

    await getDynamoDb().send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }))

    return {
      fileId: item.fileId,
      eventId: item.eventId,
      username: item.username,
      objectKey: item.objectKey,
      description: item.description,
      createdAt: new Date(now),
    }
  }

  async findOne(username: string, eventId: string, fileId: string): Promise<File | undefined> {
    const result = await getDynamoDb().send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${username}`, SK: `FILE#${eventId}#${fileId}` },
    }))

    if (!result.Item) return undefined

    const item = result.Item
    return {
      fileId: item.fileId,
      eventId: item.eventId,
      username: item.username,
      objectKey: item.objectKey,
      description: item.description,
      createdAt: new Date(item.createdAt),
      dateOfLastDownload: item.dateOfLastDownload ? new Date(item.dateOfLastDownload) : undefined,
    }
  }

  async deleteFile(username: string, eventId: string, fileId: string): Promise<void> {
    await getDynamoDb().send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${username}`, SK: `FILE#${eventId}#${fileId}` },
    }))
  }

  async findByUsernameAndEventId(username: string, eventId: string): Promise<File[]> {
    const result = await getDynamoDb().send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${username}`,
        ':skPrefix': `FILE#${eventId}#`,
      },
    }))

    return (result.Items ?? []).map((item) => ({
      fileId: item.fileId,
      eventId: item.eventId,
      username: item.username,
      objectKey: item.objectKey,
      description: item.description,
      createdAt: new Date(item.createdAt),
      dateOfLastDownload: item.dateOfLastDownload ? new Date(item.dateOfLastDownload) : undefined,
    }))
  }
}

export const fileRepository = new FileRepository()
