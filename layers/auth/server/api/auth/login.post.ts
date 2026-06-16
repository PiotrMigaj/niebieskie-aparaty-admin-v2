import { LoginSchema, SessionUserSchema } from '../../../shared/types/schemas'

export default defineEventHandler(async (event) => {
  const { username, password } = await readValidatedBody(event, (b) => LoginSchema.parse(b))

  if (!verifyAdminCredentials(username, password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, {
    user: SessionUserSchema.parse({ username }),
  })

  return { ok: true }
})
