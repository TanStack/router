import { createFileRoute, Link, redirect } from '@tanstack/react-router'

type RedirectSearch = {
  doRedirect?: boolean
}

export const Route = createFileRoute('/redirect')({
  component: RedirectComponent,
  validateSearch: (search: Record<string, unknown>): RedirectSearch => ({
    doRedirect: Boolean(search['doRedirect']),
  }),
  beforeLoad: ({ search }) => {
    if (search.doRedirect) {
      throw redirect({ to: '/', search: { redirected: 'true' }, replace: true })
    }
  },
})

function RedirectComponent() {
  return (
    <div>
      <h2>Redirect</h2>

      <p>
        This route redirects if the `doRedirect=true` search param is present.
        Should support redirect on the server as well on first load when
        relevant.
      </p>

      <p>
        NOTE: the server side of things doesn't seem to be working atm. Could be
        an issue in tanstack router.
      </p>

      <p>
        <Link to="/redirect" search={{ doRedirect: true }}>
          Redirect
        </Link>
      </p>
    </div>
  )
}
