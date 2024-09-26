import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, json } from '@tanstack/start'
import { Auth } from '../components/Auth'
import { hashPassword, prismaClient } from '~/utils/prisma'
import { Login } from '~/components/Login'
import { useAppSession } from '~/utils/session'

export const loginFn = createServerFn()
  .input((d) => d as { email: string; password: string })
  .handler(async ({ input }) => {
    // Find the user
    const user = await prismaClient.user.findUnique({
      where: {
        email: input.email,
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
    const hashedPassword = await hashPassword(input.password)

    if (user.password !== hashedPassword) {
      return {
        error: true,
        message: 'Incorrect password',
      }
    }

    // Create a session
    const session = await useAppSession()

    // Store the user's email in the session
    await session.update({
      userEmail: user.email,
    })
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
