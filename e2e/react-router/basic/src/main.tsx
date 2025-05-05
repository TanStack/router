import ReactDOM from 'react-dom/client'
import {
  ErrorComponent,
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { NotFoundError, fetchPost, fetchPosts } from './posts'
import './styles.css'
import type { ErrorComponentProps } from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    )
  },
})

function RootComponent() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg border-b">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>{' '}
        <Link
          to="/posts"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Posts
        </Link>{' '}
        <Link to="/posts" viewTransition>
          View Transition
        </Link>{' '}
        <Link to="/posts" viewTransition={{ types: ['dummy'] }}>
          View Transition types
        </Link>{' '}
        <Link
          to="/layout-a"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Layout
        </Link>{' '}
        <Link
          // @ts-expect-error
          to="/this-route-does-not-exist"
          activeProps={{
            className: 'font-bold',
          }}
        >
          This Route Does Not Exist
        </Link>
      </div>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}

export const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
}).lazy(() => import('./posts.lazy').then((d) => d.Route))

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  errorComponent: PostErrorComponent,
  loader: ({ params }) => fetchPost(params.postId),
  component: PostComponent,
})

function PostErrorComponent({ error }: ErrorComponentProps) {
  if (error instanceof NotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}

function PostComponent() {
  const post = postRoute.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold">{post.title}</h4>
      <hr className="opacity-20" />
      <div className="text-sm">{post.body}</div>
    </div>
  )
}

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div className="p-2">
      <div className="border-b">I'm a layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}

const layout2Route = createRoute({
  getParentRoute: () => layoutRoute,
  id: '_layout-2',
  component: Layout2Component,
})

function Layout2Component() {
  return (
    <div>
      <div>I'm a nested layout</div>
      <div className="flex gap-2 border-b">
        <Link
          to="/layout-a"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Layout A
        </Link>
        <Link
          to="/layout-b"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Layout B
        </Link>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}

const layoutARoute = createRoute({
  getParentRoute: () => layout2Route,
  path: '/layout-a',
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return <div>I'm layout A!</div>
}

const layoutBRoute = createRoute({
  getParentRoute: () => layout2Route,
  path: '/layout-b',
  component: LayoutBComponent,
})

function LayoutBComponent() {
  return <div>I'm layout B!</div>
}

const paramsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/params',
})

const paramsIndexRoute = createRoute({
  getParentRoute: () => paramsRoute,
  path: '/',
  component: function ParamsIndex() {
    return (
      <div>
        <h3 className="pb-2">Named path params</h3>
        <ul className="grid mb-2">
          <li>
            <Link
              data-testid="l-to-named-foo"
              to="/params/named/$foo"
              params={{ foo: 'foo' }}
            >
              /params/named/$foo
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-named-prefixfoo"
              to="/params/named/prefix${foo}"
              params={{ foo: 'foo' }}
            >
              /params/named/{'prefix${foo}'}
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-named-foosuffix"
              to="/params/named/${foo}suffix"
              params={{ foo: 'foo' }}
            >
              /params/named/{'${foo}suffix'}
            </Link>
          </li>
        </ul>
        <hr />
        <h3 className="pb-2">Wildcard path params</h3>
        <ul className="grid mb-2">
          <li>
            <Link
              data-testid="l-to-wildcard-foo"
              to="/params/wildcard/$"
              params={{ _splat: 'foo' }}
            >
              /params/wildcard/$
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-wildcard-prefixfoo"
              to="/params/wildcard/prefix${$}"
              params={{ _splat: 'foo' }}
            >
              /params/wildcard/{'prefix${$}'}
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-wildcard-foosuffix"
              to="/params/wildcard/${$}suffix"
              params={{ _splat: 'foo' }}
            >
              /params/wildcard/{'${$}suffix'}
            </Link>
          </li>
        </ul>
      </div>
    )
  },
})

const paramsNamedRoute = createRoute({
  getParentRoute: () => paramsRoute,
  path: '/named',
})

const paramsNamedIndexRoute = createRoute({
  getParentRoute: () => paramsNamedRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params/named' })
  },
})

const paramsNamedFooRoute = createRoute({
  getParentRoute: () => paramsNamedRoute,
  path: '/$foo',
  component: function ParamsNamedFoo() {
    const p = paramsNamedFooRoute.useParams()
    return (
      <div>
        ParamsNamedFoo:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsNamedFooPrefixRoute = createRoute({
  getParentRoute: () => paramsNamedRoute,
  path: '/prefix${foo}',
  component: function ParamsNamedFooMarkdown() {
    const p = paramsNamedFooPrefixRoute.useParams()
    return (
      <div>
        ParamsNamedFooPrefix:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsNamedFooSuffixRoute = createRoute({
  getParentRoute: () => paramsNamedRoute,
  path: '/${foo}suffix',
  component: function ParamsNamedFooSuffix() {
    const p = paramsNamedFooSuffixRoute.useParams()
    return (
      <div>
        ParamsNamedFooSuffix:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsWildcardRoute = createRoute({
  getParentRoute: () => paramsRoute,
  path: '/wildcard',
})

const paramsWildcardIndexRoute = createRoute({
  getParentRoute: () => paramsWildcardRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params' })
  },
})

const paramsWildcardSplatRoute = createRoute({
  getParentRoute: () => paramsWildcardRoute,
  path: '$',
  component: function ParamsWildcardSplat() {
    const p = paramsWildcardSplatRoute.useParams()
    return (
      <div>
        ParamsWildcardSplat:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsWildcardSplatPrefixRoute = createRoute({
  getParentRoute: () => paramsWildcardRoute,
  path: 'prefix${$}',
  component: function ParamsWildcardSplatPrefix() {
    const p = paramsWildcardSplatPrefixRoute.useParams()
    return (
      <div>
        ParamsWildcardSplatPrefix:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsWildcardSplatSuffixRoute = createRoute({
  getParentRoute: () => paramsWildcardRoute,
  path: '${$}suffix',
  component: function ParamsWildcardSplatSuffix() {
    const p = paramsWildcardSplatSuffixRoute.useParams()
    return (
      <div>
        ParamsWildcardSplatSuffix:{' '}
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  layoutRoute.addChildren([
    layout2Route.addChildren([layoutARoute, layoutBRoute]),
  ]),
  paramsRoute.addChildren([
    paramsNamedRoute.addChildren([
      paramsNamedFooPrefixRoute,
      paramsNamedFooSuffixRoute,
      paramsNamedFooRoute,
      paramsNamedIndexRoute,
    ]),
    paramsWildcardRoute.addChildren([
      paramsWildcardSplatRoute,
      paramsWildcardSplatPrefixRoute,
      paramsWildcardSplatSuffixRoute,
      paramsWildcardIndexRoute,
    ]),
    paramsIndexRoute,
  ]),
  indexRoute,
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
  scrollRestoration: true,
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(<RouterProvider router={router} />)
}
