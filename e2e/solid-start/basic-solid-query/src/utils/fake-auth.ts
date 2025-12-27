import { queryOptions } from '@tanstack/solid-query'
import { createClientOnlyFn } from '@tanstack/solid-start'

export const isAuthed = createClientOnlyFn(
  () => localStorage.getItem('auth') === 'true',
)

export const authQy = queryOptions({
  queryKey: ['auth'],
  queryFn: isAuthed,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
})
