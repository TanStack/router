import { createServerFn } from '@tanstack/react-start'
import { makeNested } from './data'

export const getClientEntryPing = createServerFn().handler(() => {
  return 'ready'
})

export const getClientEntryNested = createServerFn().handler(() => {
  return makeNested()
})
