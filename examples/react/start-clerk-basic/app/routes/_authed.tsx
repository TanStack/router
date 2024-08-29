import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-start'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.user.userId) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    if (error.message === 'Not authenticated') {
      return (
        <div className="flex items-center justify-center p-12">
          <SignIn forceRedirectUrl={window.location.href} />
        </div>
      )
    }

    throw error
  },
})
