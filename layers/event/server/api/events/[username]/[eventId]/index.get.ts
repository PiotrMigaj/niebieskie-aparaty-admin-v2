import { eventRepository } from "../../../../repository/eventRepository";
import { fileRepository } from "#layers/file/server/repository/fileRepository";

export default defineEventHandler(async (e) => {
  const username = getRouterParam(e, "username")!;
  const eventId = getRouterParam(e, "eventId")!;
  const event = await eventRepository.findByUsernameAndEventId(
    username,
    eventId,
  );
  if (!event)
    throw createError({
      statusCode: 404,
      message: `Event with eventId: ${eventId} and username ${username} not found`,
    });

  const { include } = getQuery(e);
  if (include === "files") {
    const files = await fileRepository.findByUsernameAndEventId(username, eventId);
    return { ...event, files };
  }

  return event;
});
