import { Link, Outlet } from '@tanstack/vue-router'

export const Route = createFileRoute({
  component: () => (
    <div>
      Hello!
      <br />{' '}
      <Link
        to="/classic/hello/universe"
        activeProps={{
          class: 'font-bold',
        }}
      >
        say hello to the universe
      </Link>{' '}
      <Link
        to="/classic/hello/world"
        activeProps={{
          class: 'font-bold',
        }}
      >
        say hello to the world
      </Link>
      <Outlet />
    </div>
  ),
})
