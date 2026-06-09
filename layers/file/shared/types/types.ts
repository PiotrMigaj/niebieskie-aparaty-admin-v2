export interface File {
  fileId: string
  eventId: string
  username: string
  objectKey: string
  description: string
  createdAt: Date
  dateOfLastDownload?: Date
}
