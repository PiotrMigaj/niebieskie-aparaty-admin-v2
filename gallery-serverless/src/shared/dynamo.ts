import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export const TABLE_NAME = process.env.TABLE_NAME!

let client: DynamoDBDocumentClient | undefined

export function getDynamo(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    })
  }
  return client
}
