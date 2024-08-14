import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/start'
import { hashPassword, prismaClient } from '~/utils/prisma'
import { sessionStorage } from '~/utils/session'
import { useMutation } from '~/hooks/useMutation'
import { Auth } from '~/components/Auth'

export const signupFn = createServerFn(
  'POST',
  async (
    payload: { email: string; password: string; redirectUrl?: string },
    context,
  ) => {
    // Check if the user already exists
    const found = await prismaClient.user.findUnique({
      where: {
        email: payload.email,
      },
    })

    // Encrypt the password using Sha256 into plaintext
    const password = await hashPassword(payload.password)

    // Create a session
    const session = await sessionStorage.getSession(
      context.request.headers.get('cookie'),
    )

    if (found) {
      if (found.password !== password) {
        return {
          error: true,
          userExists: true,
          message: 'User already exists',
        }
      }

      // Store the user's email in the session
      session.set('userEmail', found.email)

      // Redirect to the prev page stored in the "redirect" search param
      throw redirect({
        href: payload.redirectUrl || '/',
        headers: {
          'Set-Cookie': await sessionStorage.commitSession(session),
        },
      })
    }

    // Create the user
    const user = await prismaClient.user.create({
      data: {
        email: payload.email,
        password,
      },
    })

    // Store the user's email in the session
    session.set('userEmail', user.email)

    // Redirect to the prev page stored in the "redirect" search param
    throw redirect({
      href: payload.redirectUrl || '/',
      headers: {
        'Set-Cookie': await sessionStorage.commitSession(session),
      },
    })
  },
)

export const Route = createFileRoute('/signup')({
  component: SignupComp,
})

function SignupComp() {
  const signupMutation = useMutation({
    fn: useServerFn(signupFn),
  })

  return (
    <Auth
      actionText="Sign Up"
      status={signupMutation.status}
      onSubmit={(e) => {
        const formData = new FormData(e.target as HTMLFormElement)

        signupMutation.mutate({
          email: formData.get('email') as string,
          password: formData.get('password') as string,
        })
      }}
      afterSubmit={
        signupMutation.data?.error ? (
          <>
            <div className="text-red-400">{signupMutation.data.message}</div>
          </>
        ) : null
      }
    />
  )
}
