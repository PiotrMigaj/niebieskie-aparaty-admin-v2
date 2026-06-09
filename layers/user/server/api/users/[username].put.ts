import { UpdateUserSchema } from '../../../shared/types/schemas'
import { userRepository } from '../../repository/userRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const body = await readValidatedBody(event, (b) => UpdateUserSchema.parse(b))

  const user = await userRepository.findByUsername(username)
  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  if (user.active === body.active) {
    throw createError({
      statusCode: 422,
      message: user.active ? 'User is already active' : 'User is already inactive',
    })
  }

  return userRepository.updateStatus(username, body.active)
})
