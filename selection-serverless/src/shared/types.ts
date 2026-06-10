export interface S3EventBridgeDetail {
  bucket: { name: string }
  object: { key: string; size?: number; etag?: string }
}

export interface S3EventBridgeEvent {
  source: 'aws.s3'
  'detail-type': 'Object Created'
  detail: S3EventBridgeDetail
}

export interface FinalizeMessage {
  username: string
  eventId: string
}

export type SelectionItemStatus = 'processed' | 'failed'
