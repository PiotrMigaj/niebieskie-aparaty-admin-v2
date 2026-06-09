import type { CreateEventInput } from '../../shared/types/schemas'
import type { Event as AppEvent } from '../../shared/types/types'

export function useEvent(username?: string, eventId?: string, options?: { include?: 'files' }) {
  const fetched =
    username && eventId
      ? useFetch<AppEvent>(`/api/events/${username}/${eventId}`, {
          lazy: true,
          query: options?.include ? { include: options.include } : undefined,
        })
      : undefined

  async function createEvent(input: CreateEventInput): Promise<AppEvent> {
    return await $fetch<AppEvent>('/api/events', { method: 'POST', body: input })
  }

  return {
    event: fetched?.data,
    status: fetched?.status,
    error: fetched?.error,
    refresh: fetched?.refresh,
    createEvent,
  }
}
