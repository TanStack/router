import * as React from 'solid-js'
import { createFileRoute, useRouter } from '@tanstack/solid-router'
import { z } from 'zod'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
}).update({
  component: LoginComponent,
})

function LoginComponent() {
  const router = useRouter()
  const { auth, status } = Route.useRouteContext({
    select: ({ auth }) => ({ auth, status: auth.status }),
  })
  const search = Route.useSearch()
  const [username, setUsername] = React.createSignal('')

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    auth.login(username)
    router.invalidate()
  }

  // Ah, the subtle nuances of client side auth. 🙄
  React.useLayoutEffect(() => {
    if (status === 'loggedIn' && search.redirect) {
      router.history.push(search.redirect)
    }
  }, [status, search.redirect])

  return status === 'loggedIn' ? (
    <div>
      Logged in as <strong>{auth.username}</strong>
      <div class="h-2" />
      <button
        onClick={() => {
          auth.logout()
          router.invalidate()
        }}
        class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div class="h-2" />
    </div>
  ) : (
    <div class="p-2">
      <div>You must log in!</div>
      <div class="h-2" />
      <form onSubmit={onSubmit} class="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          class="border p-1 px-2 rounded"
        />
        <button
          type="submit"
          class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
        >
          Login
        </button>
      </form>
    </div>
  )
}
