import { Outlet, Route } from '@tanstack/solid-router'
import { createSignal, Show } from 'solid-js'
import { useAuth } from '../../App'
import { rootRoute } from '../__root'

export const authenticatedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'authenticated/',
  component: () => <Auth />,
})

export const authenticatedIndexRoute = new Route({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: () => <Authenticated />,
})

function Auth() {
  const [authStore, { login }] = useAuth()
  const [username, setUsername] = createSignal('')

  const onSubmit = (
    e: Event & {
      submitter: HTMLElement
    },
  ) => {
    e.preventDefault()

    login(username())
  }

  return (
    <Show
      when={authStore.status === 'loggedIn'}
      fallback={() => (
        <div class="p-2">
          <div>You must log in!</div>
          <div class="h-2" />
          <form onSubmit={onSubmit} class="flex gap-2">
            <input
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
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
      )}
    >
      <Outlet />
    </Show>
  )
}

function Authenticated() {
  const [authStore, { logout }] = useAuth()

  return (
    <div class="p-2">
      You're authenticated! Your username is{' '}
      <strong>{authStore.username}</strong>
      <div class="h-2" />
      <button
        onClick={logout}
        class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div class="h-2" />
      <div>
        This authentication example is obviously very contrived and simple. It
        doesn't cover the use case of a redirected login page, but does
        illustrate how easy it is to simply wrap routes with ternary logic to
        either show a login prompt or redirect (probably with the `Navigate`
        component).
      </div>
    </div>
  )
}
