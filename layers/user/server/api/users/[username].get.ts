import { eventRepository } from "#layers/event/server/repository/eventRepository";
import { userRepository } from "../../repository/userRepository";

export default defineEventHandler(async (event) => {
  await sleep(1000);
  const username = getRouterParam(event, "username")!;
  const user = await userRepository.findByUsername(username);
  if (!user) throw createError({ statusCode: 404, message: "User not found" });

  const { include } = getQuery(event);
  if (include === "events") {
    const events = await eventRepository.findAll(username);
    return { ...user, events };
  }

  return user;
});
