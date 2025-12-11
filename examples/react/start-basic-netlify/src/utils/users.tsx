import { createServerFn } from '@tanstack/react-start'

export type User = {
  id: number
  name: string
  email: string
}

export const fetchUsers = createServerFn().handler(async () => {
  console.info('Fetching users...')
  const res = await fetch('https://jsonplaceholder.typicode.com/users')
  if (!res.ok) {
    throw new Error('Failed to fetch users')
  }

  const users = await res.json()

  return (users as Array<User>).slice(0, 10)
})

export const fetchUser = createServerFn({ method: 'POST' })
  .inputValidator((d: string) => d)
  .handler(async ({ data }) => {
    console.info(`Fetching user with id ${data}...`)
    const res = await fetch(
      `https://jsonplaceholder.typicode.com/users/${data}`,
    )
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('User not found')
      }
      throw new Error('Failed to fetch user')
    }

    const user = await res.json()
    return user as User
  })
