import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'

export const TABLE_NAME = 'niebieskie-aparaty-prod'

let client: DynamoDBDocumentClient | undefined

export function getDynamoDb(): DynamoDBDocumentClient {
  if (!client) {
    const { awsRegion, awsAccessKeyId, awsSecretAccessKey } = useRuntimeConfig()
    client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
        },
      }),
      { marshallOptions: { removeUndefinedValues: true } },
    )
  }
  return client
}
