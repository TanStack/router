import { createServerFn } from '@tanstack/react-start'

export const fetchDatabaseUrl = createServerFn({ method: 'GET' }).handler(
  () => {
    return process.env.DATABASE_URL
  },
)
