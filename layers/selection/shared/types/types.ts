export interface Selection {
  selectionId: string
  eventId: string
  username: string
  eventTitle: string
  blocked: boolean
  maxNumberOfPhotos: number
  selectedNumberOfPhotos: number
  createdAt: Date
  updatedAt: Date
}

export interface SelectionItem {
  imageName: string
  selectionId: string
  eventId: string
  username: string
  objectKey: string
  cloudFrontUrl: string
  imageWidth: number
  imageHeight: number
  selected: boolean
}
