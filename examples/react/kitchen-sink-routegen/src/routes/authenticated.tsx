import { Outlet } from '@tanstack/react-router'
import * as React from 'react'
import { useAuth } from '../main'
import { routeConfig } from '../routes.generated/authenticated'

routeConfig.generate({
  component: Auth,
})

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
