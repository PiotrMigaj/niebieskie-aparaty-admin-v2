import type { CreateSelectionInput } from '../../shared/types/schemas'
import type { Selection } from '../../shared/types/types'

export interface SelectionRecord {
  PK: string
  SK: string
  GSI1PK: string
  GSI1SK: string
  entityType: 'SELECTION'
  selectionId: string
  eventId: string
  username: string
  eventTitle: string
  blocked: boolean
  maxNumberOfPhotos: number
  selectedNumberOfPhotos: number
  createdAt: string
  updatedAt: string
}

class SelectionRepository {
  buildRecord(input: Omit<CreateSelectionInput, 'items'>): SelectionRecord {
    const selectionId = crypto.randomUUID()
    const now = new Date().toISOString()
    return {
      PK: `USER#${input.username}`,
      SK: `SELECTION#${input.eventId}`,
      GSI1PK: 'ENTITY#SELECTION',
      GSI1SK: `USER#${input.username}#EVENT#${input.eventId}`,
      entityType: 'SELECTION',
      selectionId,
      eventId: input.eventId,
      username: input.username,
      eventTitle: input.eventTitle,
      blocked: false,
      maxNumberOfPhotos: input.maxNumberOfPhotos,
      selectedNumberOfPhotos: 0,
      createdAt: now,
      updatedAt: now,
    }
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

  mapItem(item: Record<string, unknown>): Selection {
    return {
      selectionId: item.selectionId as string,
      eventId: item.eventId as string,
      username: item.username as string,
      eventTitle: item.eventTitle as string,
      blocked: (item.blocked as boolean) ?? false,
      maxNumberOfPhotos: item.maxNumberOfPhotos as number,
      selectedNumberOfPhotos: (item.selectedNumberOfPhotos as number) ?? 0,
      createdAt: new Date(item.createdAt as string),
      updatedAt: new Date(item.updatedAt as string),
    }
  }
}

export const selectionRepository = new SelectionRepository()
