import { z } from 'zod'

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const SessionUserSchema = z.object({
  username: z.string().min(1),
})
export type SessionUser = z.infer<typeof SessionUserSchema>
