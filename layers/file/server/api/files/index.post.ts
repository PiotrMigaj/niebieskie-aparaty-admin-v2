import { CreateFileSchema } from "../../../shared/schemas";
import { fileRepository } from "../../repository/fileRepository";
import { userRepository } from "#layers/user/server/repository/userRepository";

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) =>
    CreateFileSchema.parse(b),
  );
  const user = await userRepository.findByUsername(body.username);
  if (!user) throw createError({ statusCode: 404, message: `User: ${body.username} not found` });
  try {
    return await fileRepository.persist(body);
  } catch (e) {
    if (isError(e)) throw e;
    throw createError({ statusCode: 500, message: "Failed to create file" });
  }
});
