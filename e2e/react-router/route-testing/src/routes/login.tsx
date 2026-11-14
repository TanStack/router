import { createFileRoute } from '@tanstack/react-router'
import type { SearchSchemaInput } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  validateSearch: (
    search: { redirect?: string } & SearchSchemaInput,
  ): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()

  return (
    <main>
      <h1>Sign in</h1>
      {redirect ? <p>You will return to {redirect}</p> : null}
    </main>
  )
}
