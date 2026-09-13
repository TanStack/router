import '@tanstack/react-start/server-only'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from './db.server'
const secret = process.env.BETTER_AUTH_SECRET
const baseURL = process.env.APP_ORIGIN
if (!secret || secret.length < 32 || !baseURL) {
  throw new Error(
    'Set BETTER_AUTH_SECRET to at least 32 characters and set APP_ORIGIN',
  )
}
export const auth = betterAuth({
  secret,
  baseURL,
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  plugins: [tanstackStartCookies()],
})
