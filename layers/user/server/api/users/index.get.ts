import { userRepository } from "../../repository/userRepository";

export default defineEventHandler(async () => {
  // await sleep(1000);
  return userRepository.findAll();
});
