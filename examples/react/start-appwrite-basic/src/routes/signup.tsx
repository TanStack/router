import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { ID } from 'node-appwrite'
import { useMutation } from '../hooks/useMutation'
import { Auth } from '../components/Auth'
import {
  createAdminClient,
  createAdminUsers,
  setAppwriteSessionCookie,
} from '../utils/appwrite'

export const signupFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { email: string; password: string; redirectUrl?: string }) => d,
  )
  .handler(async ({ data }) => {
    const { account } = createAdminClient()
    const userId = ID.unique()

    try {
      await account.create({
        userId,
        email: data.email,
        password: data.password,
      })
    } catch (error) {
      return { error: true, message: (error as Error).message }
    }

    try {
      const session = await account.createEmailPasswordSession({
        email: data.email,
        password: data.password,
      })
      setAppwriteSessionCookie(session.secret)
    } catch (error) {
      // Roll back the just-created user so a retry with the same email
      // doesn't hit `user_already_exists` and leave the caller stuck.
      try {
        await createAdminUsers().delete({ userId })
      } catch {
        // best-effort; surface the original session error either way
      }
      return { error: true, message: (error as Error).message }
    }

    // Redirect to the prev page stored in the "redirect" search param
    throw redirect({
      href: data.redirectUrl || '/',
    })
  })

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
          data: {
            email: formData.get('email') as string,
            password: formData.get('password') as string,
          },
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
