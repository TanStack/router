import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, json } from '@tanstack/start'
import { Auth } from '../components/Auth'
import { sessionStorage } from '~/utils/session.js'
import { hashPassword, prismaClient } from '~/utils/prisma'
import { Login } from '~/components/Login'

export const loginFn = createServerFn(
  'POST',
  async (
    payload: {
      email: string
      password: string
    },
    { request },
  ) => {
    // Find the user
    const user = await prismaClient.user.findUnique({
      where: {
        email: payload.email,
      },
    })

    // Check if the user exists
    if (!user) {
      return {
        error: true,
        userNotFound: true,
        message: 'User not found',
      }
    }

    // Check if the password is correct
    const hashedPassword = await hashPassword(payload.password)

    if (user.password !== hashedPassword) {
      return {
        error: true,
        message: 'Incorrect password',
      }
    }

    // Create a session
    const session = await sessionStorage.getSession(
      request.headers.get('cookie'),
    )

    // Store the user's email in the session
    session.set('userEmail', user.email)

    return json(null, {
      headers: {
        'Set-Cookie': await sessionStorage.commitSession(session),
      },
    })
  },
)

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
