import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import type { SearchSchemaInput } from '@tanstack/vue-router'

const LoginPage = defineComponent({
  setup() {
    const search = Route.useSearch()

    return () => (
      <main>
        <h1>Sign in</h1>
        {search.value.redirect ? (
          <p>You will return to {search.value.redirect}</p>
        ) : null}
      </main>
    )
  },
})

export const Route = createFileRoute('/login')({
  validateSearch: (
    search: { redirect?: string } & SearchSchemaInput,
  ): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: LoginPage,
})
