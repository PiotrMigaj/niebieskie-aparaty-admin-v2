import { z } from 'zod'

export const CreateUserSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  fullName: z.string().min(1, { message: "Full name is required" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters long" }),
  email: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email({ message: "Must be a valid email" }).optional(),
    ),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  active: z.boolean(),
})

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;