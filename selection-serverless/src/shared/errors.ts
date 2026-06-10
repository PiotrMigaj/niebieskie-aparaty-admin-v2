const PERMANENT_S3_ERRORS = new Set([
  'NoSuchKey',
  'NoSuchBucket',
  'AccessDenied',
])

export function isPermanentError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const name = err.name
  if (PERMANENT_S3_ERRORS.has(name)) return true
  if (name === 'ConditionalCheckFailedException') return true
  // sharp throws plain Error with these phrases for unrecoverable input
  const msg = err.message ?? ''
  if (/unsupported image format|Input buffer contains unsupported|Input file (is missing|contains unsupported)/i.test(msg)) {
    return true
  }
  return false
}

export function isSharpError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /sharp|webp|Input (buffer|file)/i.test(err.message ?? '')
}
