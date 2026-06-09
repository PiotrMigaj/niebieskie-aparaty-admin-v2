import { userRepository } from "~~/layers/user/server/repository/userRepository";
import { eventRepository } from "../../../repository/eventRepository";

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, "username")!;
  const user = await userRepository.findByUsername(username);
  if (!user)
    throw createError({
      statusCode: 404,
      message: `User: ${username} not found`,
    });
  return eventRepository.findAll(username);
});
