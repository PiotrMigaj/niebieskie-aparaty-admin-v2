import { z } from 'zod'

export const CreateEventSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  title: z.string().min(1, { message: 'Title is required' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
  description: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().optional(),
    ),
})

export type CreateEventInput = z.infer<typeof CreateEventSchema>

export const UpdateEventCoverSchema = z.object({
  imagePlaceholderObjectKey: z.string().min(1),
})

export type UpdateEventCoverInput = z.infer<typeof UpdateEventCoverSchema>
