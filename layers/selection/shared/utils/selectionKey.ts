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
