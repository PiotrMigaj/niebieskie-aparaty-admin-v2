import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

export function signSelectionUrl(objectKey: string): string {
  const { cloudFrontDomain, cloudFrontKeyPairId, cloudFrontPrivateKey } =
    useRuntimeConfig();
  if (!cloudFrontDomain || !cloudFrontKeyPairId || !cloudFrontPrivateKey) {
    throw new Error("CloudFront signing config missing");
  }
  return getSignedUrl({
    url: `https://${cloudFrontDomain}/${objectKey}`,
    keyPairId: cloudFrontKeyPairId,
    privateKey: cloudFrontPrivateKey,
    dateLessThan: new Date(Date.now() + SIX_MONTHS_MS).toISOString(),
  });
}
