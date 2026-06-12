export function toSelectionSafeName(filename: string): string | null {
  const safe = filename.replace(/^.*[\\/]/, '').replace(/[^\w.-]/g, '_')
  if (!safe || safe.startsWith('.')) return null
  return safe
}

export function toSelectionImageName(safeName: string): string {
  return safeName.replace(/\.[^.]+$/, '')
}

export function toSelectionObjectKey(username: string, eventId: string, safeName: string): string {
  return `${username}/${eventId}/selection/${safeName}`
}

export function injectVersion(safeName: string): string {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const dotIdx = safeName.lastIndexOf('.')
  if (dotIdx <= 0) return `${safeName}-${hex}`
  return `${safeName.slice(0, dotIdx)}-${hex}${safeName.slice(dotIdx)}`
}
