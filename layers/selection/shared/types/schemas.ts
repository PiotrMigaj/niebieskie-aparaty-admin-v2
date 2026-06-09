import { z } from 'zod'

export const CreateSelectionSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  eventId: z.string().min(1),
  eventTitle: z.string().min(1),
  maxNumberOfPhotos: z.coerce
    .number()
    .int({ message: 'Must be a whole number' })
    .min(1, { message: 'Must be at least 1' })
    .max(1000, { message: 'Cannot exceed 1000' }),
})

export type CreateSelectionInput = z.infer<typeof CreateSelectionSchema>
