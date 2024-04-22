import * as React from 'react'
import { flushSync } from 'react-dom'
import {
  createFileRoute,
  getRouteApi,
  useNavigate,
} from '@tanstack/react-router'
import { z } from 'zod'

import { useAuth } from '../auth'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    redirect: z.string().optional().catch(''),
  }),
  component: LoginComponent,
})

const routeApi = getRouteApi('/login')

function LoginComponent() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [name, setName] = React.useState('')

  const search = routeApi.useSearch()

  const handleLogin = (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    setIsSubmitting(true)

    flushSync(() => {
      auth.setUser(name)
    })

    navigate({ to: search.redirect || '/' })
  }

  return (
    <div className="p-2 grid gap-2 place-items-center">
      <h3 className="text-xl">Login page</h3>
      {search.redirect ? (
        <p className="text-red-500">You need to login to access this page.</p>
      ) : (
        <p>Login to see all the cool content in here.</p>
      )}
      <form className="mt-4 max-w-lg" onSubmit={handleLogin}>
        <fieldset disabled={isSubmitting} className="w-full grid gap-2">
          <div className="grid gap-2 items-center min-w-[300px]">
            <label htmlFor="username-input" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username-input"
              placeholder="Enter your name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white py-2 px-4 rounded-md w-full"
          >
            {isSubmitting ? 'Loading...' : 'Login'}
          </button>
        </fieldset>
      </form>
    </div>
  )
}
