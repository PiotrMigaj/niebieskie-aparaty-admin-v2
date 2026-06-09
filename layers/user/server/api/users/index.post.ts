import { CreateUserSchema } from '../../../shared/types/schemas'
import { userRepository } from '../../repository/userRepository'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (body) => CreateUserSchema.parse(body))

  const hashedPassword = await hashPassword(body.password)

  try {
    const user = await userRepository.persist({ ...body, password: hashedPassword })
    return user
  } catch (e) {
    if (isError(e)) throw e
    throw createError({ statusCode: 500, message: 'Failed to create user' })
  }
})