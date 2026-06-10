import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

export { SendMessageCommand }

let client: SQSClient | undefined

export function getSqs(): SQSClient {
  if (!client) {
    const { awsRegion, awsAccessKeyId, awsSecretAccessKey } = useRuntimeConfig()
    client = new SQSClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    })
  }
  return client
}
