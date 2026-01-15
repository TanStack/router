import { Link, Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/specialChars')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <div>Hello "/specialChars"!</div>
      <Link
        to="/specialChars/대한민국"
        activeProps={{
          class: 'font-bold',
        }}
        data-testid="special-non-latin-link"
      >
        Unicode
      </Link>{' '}
      <Link
        to="/specialChars/$param"
        activeProps={{
          class: 'font-bold',
        }}
        data-testid="special-param-link"
        params={{ param: '대|' }}
      >
        Unicode param
      </Link>{' '}
      <Link
        to="/specialChars/search"
        activeProps={{
          class: 'font-bold',
        }}
        data-testid="special-searchParam-link"
        search={{ searchParam: '대|' }}
      >
        Unicode search param
      </Link>{' '}
      <hr />
      <Outlet />
    </div>
  )
}
