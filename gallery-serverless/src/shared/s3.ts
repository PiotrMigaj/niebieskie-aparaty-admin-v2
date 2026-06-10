import { S3Client } from '@aws-sdk/client-s3'

export const GALLERY_BUCKET = process.env.GALLERY_BUCKET!

let client: S3Client | undefined

export function getS3(): S3Client {
  if (!client) client = new S3Client({})
  return client
}

export {
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
