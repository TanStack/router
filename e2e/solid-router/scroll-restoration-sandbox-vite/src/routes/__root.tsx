import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
  linkOptions,
} from '@tanstack/solid-router'
import { For } from 'solid-js'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Nav type="header" />
      <hr />
      <Outlet />
      <hr />
      <Nav type="footer" />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}

const navLinks = [
  linkOptions({ to: '/normal-page' }),
  linkOptions({ to: '/lazy-page' }),
  linkOptions({ to: '/virtual-page' }),
  linkOptions({ to: '/lazy-with-loader-page' }),
] as const

function Nav(props: { type: 'header' | 'footer' }) {
  const prefix = () => (props.type === 'header' ? 'Head' : 'Foot')
  const content = () => (
    <>
      <Link
        to="/"
        activeProps={{
          class: 'font-bold',
        }}
        activeOptions={{ exact: true }}
      >
        {prefix()}-/
      </Link>{' '}
      <For each={navLinks}>
        {(options) => (
          <Link
            {...options()}
            activeProps={{
              class: 'font-bold',
            }}
          >
            {prefix()}-{options().to}
          </Link>
        )}
      </For>
      <Link
        to="/page-with-search"
        search={{ where: props.type }}
        activeProps={{
          class: 'font-bold',
        }}
      >
        {prefix()}-/page-with-search
      </Link>
    </>
  )
  return props.type === 'header' ? (
    <header class="p-2 flex gap-2 text-lg">{content()}</header>
  ) : (
    <footer class="p-2 flex gap-2 text-lg">{content()}</footer>
  )
}
