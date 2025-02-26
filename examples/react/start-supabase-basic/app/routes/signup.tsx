import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useMutation } from '../hooks/useMutation'
import { Auth } from '../components/Auth'
import { getSupabaseServerClient } from '../utils/supabase'

export const signupFn = createServerFn()
  .validator(
    (d: unknown) =>
      d as { email: string; password: string; redirectUrl?: string },
  )
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    })
    if (error) {
      return {
        error: true,
        message: error.message,
      }
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
