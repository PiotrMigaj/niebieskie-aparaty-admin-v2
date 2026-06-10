import { S3Client } from '@aws-sdk/client-s3'

export const ORIGINALS_BUCKET = process.env.ORIGINALS_BUCKET!
export const MAIN_BUCKET = process.env.MAIN_BUCKET!

let client: S3Client | undefined

export function getS3(): S3Client {
  if (!client) client = new S3Client({})
  return client
}

export {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
