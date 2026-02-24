import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { Auth } from '../components/Auth'
import { getSupabaseServerClient } from '../utils/supabase'

function isSafeRedirectPath(redirectUrl: string) {
  if (!redirectUrl.startsWith('/')) {
    return false
  }

  if (redirectUrl.startsWith('//')) {
    return false
  }

  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(redirectUrl)
}

export const signupFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { email: string; password: string; redirectUrl?: string }) => d,
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
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

    const redirectHref =
      data.redirectUrl && isSafeRedirectPath(data.redirectUrl)
        ? data.redirectUrl
        : '/'

    throw redirect({
      href: redirectHref,
    })
  })

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect:
        typeof search.redirect === 'string' ? search.redirect : undefined,
    }
  },
  component: SignupComp,
})

function SignupComp() {
  const { redirect: redirectUrl } = Route.useSearch()

  const signupMutation = useMutation({
    mutationFn: useServerFn(signupFn),
  })

  return (
    <Auth
      actionText="Sign Up"
      status={signupMutation.status}
      onSubmit={(e) => {
        e.preventDefault()

        const form = e.target as HTMLFormElement
        const formData = new FormData(form)

        signupMutation.mutate({
          data: {
            email: formData.get('email') as string,
            password: formData.get('password') as string,
            redirectUrl,
          },
        })
      }}
      afterSubmit={
        signupMutation.data?.error ? (
          <div className="text-red-400">{signupMutation.data.message}</div>
        ) : null
      }
    />
  )
}
