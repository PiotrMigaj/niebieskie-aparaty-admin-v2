import type { User } from "../../shared/types/types";

export function useUsers() {
  const { data: users, status } = useFetch<User[]>("/api/users", {
    default: () => [],
    lazy: true,
    server: false,
  });

  return { users, status };
}
