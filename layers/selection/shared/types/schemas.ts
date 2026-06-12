import { z } from 'zod'

const SelectionItemInputSchema = z.object({
  originalFileName: z.string().min(1),
  imageName: z.string().min(1).regex(/^[\w.-]+$/, { message: 'imageName has invalid characters' }),
  imageWidth: z.number().int().min(0),
  imageHeight: z.number().int().min(0),
})

export const CreateSelectionSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  eventId: z.string().min(1),
  eventTitle: z.string().min(1),
  maxNumberOfPhotos: z.coerce
    .number()
    .int({ message: 'Must be a whole number' })
    .min(1, { message: 'Must be at least 1' })
    .max(1000, { message: 'Cannot exceed 1000' }),
  items: z.array(SelectionItemInputSchema).min(1).max(1000),
})

export type CreateSelectionInput = z.infer<typeof CreateSelectionSchema>
export type SelectionItemInput = z.infer<typeof SelectionItemInputSchema>

export const SelectionUploadUrlsSchema = z.object({
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

export type SelectionUploadUrlsInput = z.infer<typeof SelectionUploadUrlsSchema>
