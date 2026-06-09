import type { CreateUserInput } from "../../shared/types/schemas";
import type { User } from "../../shared/types/types";

export function useUser(
  username?: string,
  options?: { include?: "events" },
) {
  const fetched = username
    ? useFetch<User>(`/api/users/${username}`, {
        lazy: true,
        query: options?.include ? { include: options.include } : undefined,
      })
    : undefined;

  async function addUser(input: CreateUserInput): Promise<User> {
    return await $fetch<User>("/api/users", {
      method: "POST",
      body: input,
    });
  }

  async function toggleStatus(username: string, active: boolean): Promise<User> {
    return await $fetch<User>(`/api/users/${username}`, {
      method: "PUT",
      body: { active },
    });
  }

  return {
    user: fetched?.data,
    status: fetched?.status,
    error: fetched?.error,
    refresh: fetched?.refresh,
    addUser,
    toggleStatus,
  };
}
