import * as Solid from 'solid-js'
import {
  Link,
  Outlet,
  createRootRoute,
  linkOptions,
  HeadContent,
  Scripts,
} from '@tanstack/solid-router'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'
import { Dynamic } from 'solid-js/web'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charset: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title:
          'TanStack Start | Type-Safe, Client-First, Full-Stack React Framework',
        description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => {
    return <p>{props.error.stack}</p>
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Nav type="header" />
      <hr />
      <Outlet />
      <hr />
      <Nav type="footer" />
    </>
  )
}

function Nav({ type }: { type: 'header' | 'footer' }) {
  const Elem = type === 'header' ? 'header' : 'footer'
  const prefix = type === 'header' ? 'Head' : 'Foot'
  return (
    <Dynamic component={Elem} class="p-2 flex gap-2 text-lg">
      <Link
        to="/"
        activeProps={{
          class: 'font-bold',
        }}
        activeOptions={{ exact: true }}
      >
        {prefix}-/
      </Link>{' '}
      {(
        [
          linkOptions({ to: '/normal-page' }),
          linkOptions({ to: '/with-loader' }),
          linkOptions({ to: '/with-search', search: { where: type } }),
        ] as const
      ).map((options, i) => (
        <Link
          {...options}
          activeProps={{
            class: 'font-bold',
          }}
        >
          {prefix}-{options.to}
        </Link>
      ))}
    </Dynamic>
  )
}
