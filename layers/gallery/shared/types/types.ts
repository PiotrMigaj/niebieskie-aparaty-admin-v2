export interface Gallery {
  galleryId: string
  eventId: string
  username: string
  eventTitle: string
  isUploaded: boolean
  totalPhotos: number | null
  processedSuccessPhotos: number
  processedFailedPhotos: number
  uploadStartedAt: string | null
  uploadCompletedAt: string | null
  createdAt: Date
  updatedAt: Date
}

export type GalleryItemStatus = 'processed' | 'failed'

export interface GalleryItem {
  eventId: string
  username: string
  imageName: string
  originalFileName: string
  originalObjectKey: string
  webpObjectKey: string | null
  width: number | null
  height: number | null
  compressedSize: number | null
  status: GalleryItemStatus
  failureReason: string | null
  processedAt: string
}
