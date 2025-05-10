import { createServerFn } from '@tanstack/start'

export const fetchDatabaseUrl = createServerFn({ method: 'GET' }).handler(
  () => {
    return process.env.DATABASE_URL
  },
)
