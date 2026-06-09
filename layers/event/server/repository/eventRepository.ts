import type { CreateEventInput } from "../../shared/types/schemas";
import type { Event } from "../../shared/types/types";

class EventRepository {
  async persist(input: CreateEventInput): Promise<Event> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const item = {
      PK: `USER#${input.username}`,
      SK: `EVENT#${eventId}`,
      entityType: "EVENT",
      eventId,
      username: input.username,
      title: input.title,
      date: input.date,
      description: input.description,
      galleryAvailable: false,
      selectionAvailable: false,
      createdAt: now,
    };

    try {
      await getDynamoDb().send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (e.name === "ConditionalCheckFailedException") {
        throw createError({ statusCode: 409, message: "Event already exists" });
      }
      throw e;
    }

    return {
      eventId: item.eventId,
      username: item.username,
      title: item.title,
      date: item.date,
      description: item.description,
      galleryAvailable: item.galleryAvailable,
      selectionAvailable: item.selectionAvailable,
      createdAt: new Date(now),
    };
  }

  async findAll(username: string): Promise<Event[]> {
    const result = await getDynamoDb().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":skPrefix": "EVENT#",
        },
      }),
    );

    return (result.Items ?? []).map((item) => ({
      eventId: item.eventId,
      username: item.username,
      title: item.title,
      date: item.date,
      description: item.description,
      galleryAvailable: item.galleryAvailable,
      selectionAvailable: item.selectionAvailable,
      imagePlaceholderObjectKey: item.imagePlaceholderObjectKey,
      createdAt: new Date(item.createdAt),
    }));
  }

  async findByUsernameAndEventId(
    username: string,
    eventId: string,
  ): Promise<Event | undefined> {
    const result = await getDynamoDb().send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `EVENT#${eventId}`,
        },
      }),
    );

    const item = result.Item;
    if (!item) return undefined;

    return {
      eventId: item.eventId,
      username: item.username,
      title: item.title,
      date: item.date,
      description: item.description,
      galleryAvailable: item.galleryAvailable,
      selectionAvailable: item.selectionAvailable,
      imagePlaceholderObjectKey: item.imagePlaceholderObjectKey,
      createdAt: new Date(item.createdAt),
    };
  }

  async updateImagePlaceholder(
    username: string,
    eventId: string,
    objectKey: string,
  ): Promise<Event> {
    const result = await getDynamoDb().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `EVENT#${eventId}`,
        },
        UpdateExpression: 'SET imagePlaceholderObjectKey = :key',
        ExpressionAttributeValues: { ':key': objectKey },
        ReturnValues: 'ALL_NEW',
      }),
    )
    const item = result.Attributes!
    return {
      eventId: item.eventId,
      username: item.username,
      title: item.title,
      date: item.date,
      description: item.description,
      galleryAvailable: item.galleryAvailable,
      selectionAvailable: item.selectionAvailable,
      imagePlaceholderObjectKey: item.imagePlaceholderObjectKey,
      createdAt: new Date(item.createdAt),
    }
  }
}

export const eventRepository = new EventRepository();
