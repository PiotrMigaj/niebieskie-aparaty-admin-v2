import type { CreateUserInput } from '../../shared/schemas'
import type { User } from '../../shared/types'
import { UserRole } from '../../shared/types'

class UserRepository {

  async persist(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString()
    const item = {
      PK: `USER#${input.username}`,
      SK: '#PROFILE',
      GSI1PK: 'ENTITY#USER',
      GSI1SK: `USER#${input.username}`,
      entityType: 'USER',
      username: input.username,
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      role: UserRole.USER,
      createdAt: now,
      active: true,
    }

    try {
      await getDynamoDb().send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }))
    } catch (e) {
      if (!(e instanceof Error)) throw e
      if (e.name === 'ConditionalCheckFailedException') {
        throw createError({ statusCode: 409, message: 'Username already exists' })
      }
      throw e
    }

    return {
      username: item.username,
      fullName: item.fullName,
      email: item.email,
      role: item.role,
      createdAt: new Date(now),
      active: item.active,
    }
  }

  async findAll(): Promise<User[]> {
    const result = await getDynamoDb().send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': 'ENTITY#USER',
      },
    }))

    return (result.Items ?? []).map((item) => ({
      username: item.username,
      fullName: item.fullName,
      email: item.email,
      role: item.role,
      createdAt: new Date(item.createdAt),
      active: item.active,
    }))
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const result = await getDynamoDb().send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${username}`,
        SK: '#PROFILE',
      },
    }))

    if (!result.Item) return undefined

    return {
      username: result.Item.username,
      fullName: result.Item.fullName,
      email: result.Item.email,
      role: result.Item.role,
      createdAt: new Date(result.Item.createdAt),
      active: result.Item.active,
    }
  }
  async updateStatus(username: string, active: boolean): Promise<User> {
    const result = await getDynamoDb().send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${username}`,
        SK: '#PROFILE',
      },
      UpdateExpression: 'SET active = :active',
      ExpressionAttributeValues: { ':active': active },
      ReturnValues: 'ALL_NEW',
    }))
    const item = result.Attributes!
    return {
      username: item.username,
      fullName: item.fullName,
      email: item.email,
      role: item.role,
      createdAt: new Date(item.createdAt),
      active: item.active,
    }
  }
}

export const userRepository = new UserRepository()
