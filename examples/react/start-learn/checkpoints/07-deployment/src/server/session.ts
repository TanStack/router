import { createServerFn } from '@tanstack/react-start'
import { currentUser } from './session.server'
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(() =>
  currentUser(),
)
