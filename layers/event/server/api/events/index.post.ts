import { CreateEventSchema } from "../../../shared/types/schemas";
import { eventRepository } from "../../repository/eventRepository";
import { userRepository } from "#layers/user/server/repository/userRepository";

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) =>
    CreateEventSchema.parse(b),
  );
  const user = await userRepository.findByUsername(body.username);
  if (!user) throw createError({ statusCode: 404, message: `User: ${body.username} not found` });
  try {
    return await eventRepository.persist(body);
  } catch (e) {
    if (isError(e)) throw e;
    throw createError({ statusCode: 500, message: "Failed to create event" });
  }
});
