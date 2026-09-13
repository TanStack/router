import '@tanstack/react-start/server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
const connectionString = process.env.AUTH_DATABASE_URL
if (!connectionString) {
  throw new Error('Set AUTH_DATABASE_URL before starting the server')
}
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 5 }),
})
