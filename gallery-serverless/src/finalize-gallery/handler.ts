import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { getDynamo, TABLE_NAME } from '../shared/dynamo.js'
import { eventSk, galleryPk, gallerySk } from '../shared/keys.js'
import type { FinalizeMessage } from '../shared/types.js'

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record)
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  let msg: FinalizeMessage
  try {
    msg = JSON.parse(record.body) as FinalizeMessage
  } catch (e) {
    console.error('Malformed finalize message — dropping', { body: record.body, error: String(e) })
    return
  }

  const { username, eventId } = msg
  if (!username || !eventId) {
    console.error('Finalize message missing fields — dropping', { msg })
    return
  }

  // NB: no originals sweep — gallery originals are permanent (downloadable forever).

  const now = new Date().toISOString()
  await getDynamo().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: galleryPk(username), SK: eventSk(eventId) },
            UpdateExpression: 'SET galleryAvailable = :true, updatedAt = :now',
            ExpressionAttributeValues: { ':true': true, ':now': now },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: galleryPk(username), SK: gallerySk(eventId) },
            UpdateExpression: 'SET isUploaded = :true, uploadCompletedAt = :now, updatedAt = :now',
            ExpressionAttributeValues: { ':true': true, ':now': now },
          },
        },
      ],
    }),
  )

  console.info('Gallery finalized', { username, eventId })
}
