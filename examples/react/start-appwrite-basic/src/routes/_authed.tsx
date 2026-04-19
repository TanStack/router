import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Login } from '../components/Login'
import {
  createAdminClient,
  setAppwriteSessionCookie,
} from '../utils/appwrite'

export const loginFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { account } = createAdminClient()
      const session = await account.createEmailPasswordSession({
        email: data.email,
        password: data.password,
      })
      setAppwriteSessionCookie(session.secret)
    } catch (error) {
      return {
        error: true,
        message: (error as Error).message,
      }
    }
  })

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    if (error.message === 'Not authenticated') {
      return <Login />
    }

    throw error
  },
})
