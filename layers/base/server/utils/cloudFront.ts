import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'

export { CreateInvalidationCommand }

let client: CloudFrontClient | undefined

export function getCloudFront(): CloudFrontClient {
  if (!client) {
    const { awsRegion, awsAccessKeyId, awsSecretAccessKey } = useRuntimeConfig()
    client = new CloudFrontClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    })
  }
  return client
}

export async function invalidatePaths(
  distributionId: string,
  paths: string[],
): Promise<{ invalidationId: string | undefined; status: string | undefined }> {
  if (!distributionId) {
    throw createError({ statusCode: 500, message: 'CloudFront distribution ID is not configured' })
  }
  const res = await getCloudFront().send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: crypto.randomUUID(),
      Paths: { Quantity: paths.length, Items: paths },
    },
  }))
  return {
    invalidationId: res.Invalidation?.Id,
    status: res.Invalidation?.Status,
  }
}
