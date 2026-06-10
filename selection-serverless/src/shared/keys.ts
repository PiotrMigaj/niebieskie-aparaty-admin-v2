export interface ParsedOriginalsKey {
  username: string
  eventId: string
  originalFileName: string
  imageName: string
}

export function parseOriginalsKey(key: string): ParsedOriginalsKey | undefined {
  const decoded = decodeURIComponent(key.replace(/\+/g, ' '))
  const parts = decoded.split('/')
  if (parts.length !== 3) return undefined
  const [username, eventId, originalFileName] = parts
  if (!username || !eventId || !originalFileName) return undefined
  const imageName = originalFileName.replace(/\.[^.]+$/, '')
  if (!imageName) return undefined
  return { username, eventId, originalFileName, imageName }
}

export function selectionPk(username: string) {
  return `USER#${username}`
}

export function selectionSk(eventId: string) {
  return `SELECTION#${eventId}`
}

export function selectionItemSk(eventId: string, imageName: string) {
  return `SELECTION_ITEM#${eventId}#${imageName}`
}

export function eventSk(eventId: string) {
  return `EVENT#${eventId}`
}

export function webpKey(username: string, eventId: string, imageName: string) {
  return `${username}/${eventId}/selection/${imageName}.webp`
}
