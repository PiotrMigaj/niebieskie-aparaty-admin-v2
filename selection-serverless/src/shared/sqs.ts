import { SQSClient } from '@aws-sdk/client-sqs'

export const FINALIZE_QUEUE_URL = process.env.FINALIZE_QUEUE_URL!

let client: SQSClient | undefined

export function getSqs(): SQSClient {
  if (!client) client = new SQSClient({})
  return client
}

export { SendMessageCommand } from '@aws-sdk/client-sqs'
