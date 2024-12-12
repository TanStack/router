import { useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ErrorComponent,
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { NotFoundError, fetchPost, fetchPosts } from './posts'
import type { ErrorComponentProps } from '@tanstack/react-router'
import * as React from 'react'

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

export const anchorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'anchor',
  component: AnchorComponent,
})

const anchors: Array<{
  id: string
  title: string
  hashChangeScrollIntoView?: boolean | ScrollIntoViewOptions
}> = [
  {
    id: 'default-anchor',
    title: 'Default Anchor',
  },
  {
    id: 'false-anchor',
    title: 'No Scroll Into View',
    hashChangeScrollIntoView: false,
  },
  {
    id: 'smooth-scroll',
    title: 'Smooth Scroll',
    hashChangeScrollIntoView: { behavior: 'smooth' },
  },
] as const

function AnchorComponent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [withScroll, setWithScroll] = useState(true)

  return (
    <div className="flex flex-col w-full">
      <nav className="sticky top-0 z-10 p-2 bg-gray-50 dark:bg-gray-900 border-b">
        <ul className="inline-flex gap-2">
          {anchors.map((anchor) => (
            <li key={anchor.id}>
              <Link
                hash={anchor.id}
                activeOptions={{ includeHash: true }}
                activeProps={{
                  className: 'font-bold',
                }}
                hashChangeScrollIntoView={anchor.hashChangeScrollIntoView}
              >
                {anchor.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="overflow-auto">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const formData = new FormData(event.target as HTMLFormElement)

            const toHash = formData.get('hash') as string

            if (!toHash) {
              return
            }

            const hashChangeScrollIntoView = withScroll
              ? ({
                  behavior: formData.get('scrollBehavior') ?? 'instant',
                  block: formData.get('scrollBlock') ?? 'start',
                  inline: formData.get('scrollInline') ?? 'nearest',
                } as ScrollIntoViewOptions)
              : false

            navigate({ hash: toHash, hashChangeScrollIntoView })
          }}
          className="p-2 space-y-2"
        >
          <h1 className="font-bold text-xl">Scroll with navigate</h1>
          <div className="space-y-2">
            <label>
              <span>Target Anchor</span>
              <select
                className="border border-opacity-50 rounded p-2 w-full"
                defaultValue={location.hash || anchors[0].id}
                name="hash"
              >
                {anchors.map((anchor) => (
                  <option key={anchor.id} value={anchor.id}>
                    {anchor.title}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={withScroll}
                  onChange={(e) => setWithScroll(e.target.checked)}
                />{' '}
                Scroll Into View
              </label>
            </div>
          </div>
          {withScroll ? (
            <>
              <div className="space-y-2">
                <label>
                  <span>Behavior</span>
                  <select
                    className="border border-opacity-50 rounded p-2 w-full"
                    defaultValue="instant"
                    name="scrollBehavior"
                  >
                    <option value="instant">instant</option>
                    <option value="smooth">smooth</option>
                    <option value="auto">auto</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <label>
                  <span>Block</span>
                  <select
                    className="border border-opacity-50 rounded p-2 w-full"
                    defaultValue="start"
                    name="scrollBlock"
                  >
                    <option value="start">start</option>
                    <option value="center">center</option>
                    <option value="end">end</option>
                    <option value="nearest">nearest</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <label>
                  <span>Inline</span>
                  <select
                    className="border border-opacity-50 rounded p-2 w-full"
                    defaultValue="nearest"
                    name="scrollInline"
                  >
                    <option value="start">start</option>
                    <option value="center">center</option>
                    <option value="end">end</option>
                    <option value="nearest">nearest</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}
          <div>
            <button className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50">
              Navigate
            </button>
          </div>
        </form>

        {anchors.map((anchor) => (
          <div key={anchor.id} className="p-2 min-h-dvh">
            <h1 id={anchor.id} className="font-bold text-xl pt-10">
              {anchor.title}
            </h1>
          </div>
        ))}
      </main>
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

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  layoutRoute.addChildren([
    layout2Route.addChildren([layoutARoute, layoutBRoute]),
  ]),
  anchorRoute,
  indexRoute,
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
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
