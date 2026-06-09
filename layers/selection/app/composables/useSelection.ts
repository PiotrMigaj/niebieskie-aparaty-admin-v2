import type { Selection } from '#layers/selection/shared/types/types'

export function useSelection(username: string, eventId: string) {
  return useFetch<Selection>(`/api/selections/${username}/${eventId}`, {
    key: `selection-${username}-${eventId}`,
    lazy: true,
  })
}
