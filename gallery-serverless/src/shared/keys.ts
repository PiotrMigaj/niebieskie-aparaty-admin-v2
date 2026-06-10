export interface ParsedOriginalsKey {
  username: string
  eventId: string
  originalFileName: string
  imageName: string
}

// Parse a gallery originals object key of shape `{username}/{eventId}/original/{filename}`.
// Returns undefined for anything else, including the `compressed/` subfolder.
// (The EventBridge wildcard filter on `*/original/*` filters those at the bus;
// this is defence-in-depth.)
export function parseOriginalsKey(key: string): ParsedOriginalsKey | undefined {
  const decoded = decodeURIComponent(key.replace(/\+/g, ' '))
  const parts = decoded.split('/')
  if (parts.length !== 4) return undefined
  const [username, eventId, folder, originalFileName] = parts
  if (!username || !eventId || folder !== 'original' || !originalFileName) return undefined
  const imageName = originalFileName.replace(/\.[^.]+$/, '')
  if (!imageName) return undefined
  return { username, eventId, originalFileName, imageName }
}

export function galleryPk(username: string) {
  return `USER#${username}`
}

export function gallerySk(eventId: string) {
  return `GALLERY#${eventId}`
}

export function galleryItemSk(eventId: string, imageName: string) {
  return `GALLERY_ITEM#${eventId}#${imageName}`
}

export function eventSk(eventId: string) {
  return `EVENT#${eventId}`
}

export function originalKey(username: string, eventId: string, originalFileName: string) {
  return `${username}/${eventId}/original/${originalFileName}`
}

export function webpKey(username: string, eventId: string, imageName: string) {
  return `${username}/${eventId}/compressed/${imageName}.webp`
}
