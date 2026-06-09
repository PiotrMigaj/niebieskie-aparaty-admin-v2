import { userRepository } from "#layers/user/server/repository/userRepository";
import { fileRepository } from "../../../../repository/fileRepository";

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, "username")!;
  const eventId = getRouterParam(event, "eventId")!;
  const user = await userRepository.findByUsername(username);
  if (!user)
    throw createError({ statusCode: 404, message: `User: ${username} not found` });
  return fileRepository.findByUsernameAndEventId(username, eventId);
});
