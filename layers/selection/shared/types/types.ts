export interface Selection {
  selectionId: string
  eventId: string
  username: string
  eventTitle: string
  blocked: boolean
  maxNumberOfPhotos: number
  selectedNumberOfPhotos: number
  isUploaded: boolean
  totalPhotos: number | null
  processedSuccessPhotos: number
  processedFailedPhotos: number
  uploadStartedAt: string | null
  uploadCompletedAt: string | null
  createdAt: Date
  updatedAt: Date
}
