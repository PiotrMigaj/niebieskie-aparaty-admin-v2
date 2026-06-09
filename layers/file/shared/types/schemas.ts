import { z } from 'zod'

export const CreateFileSchema = z.object({
  username: z.string().min(1),
  eventId: z.string().min(1),
  objectKey: z.string().min(1),
  description: z.string().min(1),
})

export type CreateFileInput = z.infer<typeof CreateFileSchema>
