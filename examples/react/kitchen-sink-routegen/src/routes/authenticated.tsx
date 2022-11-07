import { createRouteConfig, Outlet } from '@tanstack/react-router'
import * as React from 'react'
import { useAuth } from '../main'

export default createRouteConfig()
  .createRoute({
    path: 'authenticated/',
    element: <Auth />,
  })
  .createChildren((createRoute) => [
    createRoute({
      path: '/',
      element: <Authenticated />,
    }),
  ])

function Auth() {
  const auth = useAuth()
  const [username, setUsername] = React.useState('')

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    auth.login(username)
  }

  return auth.status === 'loggedIn' ? (
    <Outlet />
  ) : (
    <div className="p-2">
      <div>You must log in!</div>
      <div className="h-2" />
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="border p-1 px-2 rounded"
        />
        <button
          onClick={() => auth.logout()}
          className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
        >
          Login
        </button>
      </form>
    </div>
  )
}

function Authenticated() {
  const auth = useAuth()

  return (
    <div className="p-2">
      You're authenticated! Your username is <strong>{auth.username}</strong>
      <div className="h-2" />
      <button
        onClick={() => auth.logout()}
        className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div className="h-2" />
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
