import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    // The root loader populates `context.user` from the validated session.
    // Redirect unauthenticated visitors to the login flow.
    if (!context.user) {
      throw redirect({ to: '/login' })
    }
  },
})
