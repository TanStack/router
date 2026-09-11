import { createFileRoute, useHydrated, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../auth-client'
export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: Login,
})
function Login() {
  const [signup, setSignup] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const hydrated = useHydrated()
  const router = useRouter()
  return (
    <main>
      <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
      <form
        method="post"
        onSubmit={async (event) => {
          event.preventDefault()
          const fields = new FormData(event.currentTarget)
          const email = String(fields.get('email') ?? '')
          const password = String(fields.get('password') ?? '')
          setPending(true)
          setError('')
          try {
            const result = signup
              ? await authClient.signUp.email({
                  email,
                  password,
                  name: String(fields.get('name') ?? '').trim(),
                })
              : await authClient.signIn.email({ email, password })
            if (result.error) {
              setError(
                signup
                  ? 'Could not create that account.'
                  : 'Invalid email or password.',
              )
            } else {
              await router.invalidate()
              await router.navigate({ to: '/dashboard' })
            }
          } catch {
            setError('Could not complete the request. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        <fieldset disabled={!hydrated || pending}>
          {signup ? (
            <p>
              <label>
                Name{' '}
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
            </p>
          ) : null}
          <p>
            <label>
              Email{' '}
              <input name="email" type="email" required autoComplete="email" />
            </label>
          </p>
          <p>
            <label>
              Password{' '}
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
            </label>
          </p>
          <button type="submit">
            {pending ? 'Please wait...' : signup ? 'Create account' : 'Sign in'}
          </button>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <button
        disabled={!hydrated || pending}
        onClick={() => {
          setSignup(!signup)
          setError('')
        }}
      >
        {signup ? 'Use an existing account' : 'Create an account'}
      </button>
    </main>
  )
}
