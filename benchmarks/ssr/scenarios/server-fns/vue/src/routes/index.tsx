import { createFileRoute } from '@tanstack/vue-router'
import { ctxEcho, echoGet, echoPost, notFounder, redirector } from '../fns'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return (
    // The benchmark calls each of these over HTTP, as a browser would: only
    // server fns the client bundle references answer HTTP in production.
    <main
      data-get={echoGet.url}
      data-post={echoPost.url}
      data-redirect={redirector.url}
      data-not-found={notFounder.url}
      data-context={ctxEcho.url}
    >
      server-fns
    </main>
  )
}
