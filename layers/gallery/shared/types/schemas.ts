import { z } from 'zod'

export const CreateGallerySchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  eventId: z.string().min(1),
  eventTitle: z.string().min(1),
})

export type CreateGalleryInput = z.infer<typeof CreateGallerySchema>

export const GalleryUploadUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        size: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(2000),
})

export type GalleryUploadUrlsInput = z.infer<typeof GalleryUploadUrlsSchema>

export const GalleryFinalizeUploadSchema = z.object({
  totalPhotos: z.number().int().min(0),
})

export type GalleryFinalizeUploadInput = z.infer<typeof GalleryFinalizeUploadSchema>
