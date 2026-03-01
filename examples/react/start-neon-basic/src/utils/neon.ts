import { Pool } from '@neondatabase/serverless'

export function getNeonServerClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  return pool
}
