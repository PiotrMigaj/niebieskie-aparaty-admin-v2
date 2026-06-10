import type { Gallery, GalleryItem } from '#layers/gallery/shared/types/types'

export type GalleryWithItems = Gallery & { items?: GalleryItem[] }

export function useGallery(
  username: string,
  eventId: string,
  options?: { include?: 'items' },
) {
  return useFetch<GalleryWithItems>(`/api/galleries/${username}/${eventId}`, {
    key: `gallery-${username}-${eventId}${options?.include ? `-${options.include}` : ''}`,
    lazy: true,
    query: options?.include ? { include: options.include } : undefined,
  })
}
