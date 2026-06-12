import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6

const ssm = new SSMClient({})
let cachedPrivateKey: string | undefined

async function getPrivateKey(): Promise<string> {
  if (cachedPrivateKey) return cachedPrivateKey
  const paramName = process.env.CLOUD_FRONT_PRIVATE_KEY_PARAM
  if (!paramName) throw new Error('CLOUD_FRONT_PRIVATE_KEY_PARAM env var missing')
  const result = await ssm.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true }),
  )
  const value = result.Parameter?.Value
  if (!value) throw new Error(`SSM parameter ${paramName} returned no value`)
  cachedPrivateKey = value
  return value
}

export async function signGalleryUrl(objectKey: string): Promise<string> {
  const domain = process.env.CLOUD_FRONT_DOMAIN
  const keyPairId = process.env.CLOUD_FRONT_KEY_PAIR_ID
  if (!domain || !keyPairId) {
    throw new Error('CloudFront signing env vars missing (CLOUD_FRONT_DOMAIN / CLOUD_FRONT_KEY_PAIR_ID)')
  }
  return getSignedUrl({
    url: `https://${domain}/${objectKey}`,
    keyPairId,
    privateKey: await getPrivateKey(),
    dateLessThan: new Date(Date.now() + SIX_MONTHS_MS).toISOString(),
  })
}
