import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  ssr: false,
  head: () => ({
    meta: [{ title: 'Login' }],
  }),
  component: Login,
})

function Login() {
  const navigate = useNavigate()

  return (
    <main data-testid="login-page">
      <h1>Login</h1>
      <button
        type="button"
        data-testid="login-button"
        onClick={() => {
          window.localStorage.setItem('issue-6221-auth', 'true')
          void navigate({ to: '/dashboard', replace: true })
        }}
      >
        Log in
      </button>
    </main>
  )
}
