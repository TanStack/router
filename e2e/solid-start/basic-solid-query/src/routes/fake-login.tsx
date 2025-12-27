import { useQueryClient } from '@tanstack/solid-query'
import { createFileRoute, useNavigate } from '@tanstack/solid-router'
import { authQy } from '~/utils/fake-auth'

export const Route = createFileRoute('/fake-login')({
  ssr: false,
  head: () => ({
    meta: [{ title: 'Login' }],
  }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const handleLogin = () => {
    localStorage.setItem('auth', 'true')

    // Critical: Invalidate auth query to trigger refetch
    queryClient.invalidateQueries({ queryKey: authQy.queryKey })

    // Navigate to dashboard, REPLACING login in history
    navigate({ to: '/test-head/dashboard', replace: true })
  }

  return (
    <div class="p-4" data-testid="login-page">
      <h1 class="text-2xl font-bold" data-testid="login-title">
        Login Page
      </h1>
      <p class="mt-4">Click below to simulate login</p>
      <button
        type="button"
        onClick={handleLogin}
        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        data-testid="login-button"
      >
        Simulate Login →
      </button>
    </div>
  )
}
