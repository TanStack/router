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

const paramsPsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/params-ps',
})

const paramsPsIndexRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/',
  component: function ParamsIndex() {
    return (
      <div>
        <h3 className="pb-2">Named path params</h3>
        <ul className="grid mb-2">
          <li>
            <Link
              data-testid="l-to-named-foo"
              to="/params-ps/named/$foo"
              params={{ foo: 'foo' }}
            >
              /params-ps/named/$foo
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-named-prefixfoo"
              to="/params-ps/named/prefix{$foo}"
              params={{ foo: 'foo' }}
            >
              /params-ps/named/{'prefix{$foo}'}
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-named-foosuffix"
              to="/params-ps/named/{$foo}suffix"
              params={{ foo: 'foo' }}
            >
              /params-ps/named/{'{$foo}suffix'}
            </Link>
          </li>
        </ul>
        <hr />
        <h3 className="pb-2">Wildcard path params</h3>
        <ul className="grid mb-2">
          <li>
            <Link
              data-testid="l-to-wildcard-foo"
              to="/params-ps/wildcard/$"
              params={{ _splat: 'foo' }}
            >
              /params-ps/wildcard/$
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-wildcard-prefixfoo"
              to="/params-ps/wildcard/prefix{$}"
              params={{ _splat: 'foo' }}
            >
              /params-ps/wildcard/{'prefix{$}'}
            </Link>
          </li>
          <li>
            <Link
              data-testid="l-to-wildcard-foosuffix"
              to="/params-ps/wildcard/{$}suffix"
              params={{ _splat: 'foo' }}
            >
              /params-ps/wildcard/{'{$}suffix'}
            </Link>
          </li>
        </ul>
      </div>
    )
  },
})

const paramsPsNamedRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/named',
})

const paramsPsNamedIndexRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params-ps' })
  },
})

const paramsPsNamedFooRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/$foo',
  component: function ParamsNamedFoo() {
    const p = paramsPsNamedFooRoute.useParams()
    return (
      <div>
        <h3>ParamsNamedFoo</h3>
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsPsNamedFooPrefixRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/prefix{$foo}',
  component: function ParamsNamedFooMarkdown() {
    const p = paramsPsNamedFooPrefixRoute.useParams()
    return (
      <div>
        <h3>ParamsNamedFooPrefix</h3>
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsPsNamedFooSuffixRoute = createRoute({
  getParentRoute: () => paramsPsNamedRoute,
  path: '/{$foo}suffix',
  component: function ParamsNamedFooSuffix() {
    const p = paramsPsNamedFooSuffixRoute.useParams()
    return (
      <div>
        <h3>ParamsNamedFooSuffix</h3>
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsPsWildcardRoute = createRoute({
  getParentRoute: () => paramsPsRoute,
  path: '/wildcard',
})

const paramsPsWildcardIndexRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/params-ps' })
  },
})

const paramsPsWildcardSplatRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '$',
  component: function ParamsWildcardSplat() {
    const p = paramsPsWildcardSplatRoute.useParams()
    return (
      <div>
        <h3>ParamsWildcardSplat</h3>
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsPsWildcardSplatPrefixRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: 'prefix{$}',
  component: function ParamsWildcardSplatPrefix() {
    const p = paramsPsWildcardSplatPrefixRoute.useParams()
    return (
      <div>
        <h3>ParamsWildcardSplatPrefix</h3>
        <div data-testid="params-output">{JSON.stringify(p)}</div>
      </div>
    )
  },
})

const paramsPsWildcardSplatSuffixRoute = createRoute({
  getParentRoute: () => paramsPsWildcardRoute,
  path: '{$}suffix',
  component: function ParamsWildcardSplatSuffix() {
    const p = paramsPsWildcardSplatSuffixRoute.useParams()
    return (
      <div>
        <h3>ParamsWildcardSplatSuffix</h3>
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
  paramsPsRoute.addChildren([
    paramsPsNamedRoute.addChildren([
      paramsPsNamedFooPrefixRoute,
      paramsPsNamedFooSuffixRoute,
      paramsPsNamedFooRoute,
      paramsPsNamedIndexRoute,
    ]),
    paramsPsWildcardRoute.addChildren([
      paramsPsWildcardSplatRoute,
      paramsPsWildcardSplatPrefixRoute,
      paramsPsWildcardSplatSuffixRoute,
      paramsPsWildcardIndexRoute,
    ]),
    paramsPsIndexRoute,
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
