import {
  Body,
  HeadContent,
  Html,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/vue-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <Html>
      <head>
        <HeadContent />
      </head>
      <Body>
        <div>
          <Link
            to="/"
            activeProps={{ class: 'font-bold' }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link to="/server-fns" activeProps={{ class: 'font-bold' }}>
            Server Functions
          </Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </Body>
    </Html>
  )
}
