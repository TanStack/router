import { For, render } from 'solid-js/web'
import {
  ErrorComponent,
  Link,
  Outlet,
  RootRoute,
  Route,
  Router,
  RouterProvider,
} from './router/solid-router'

type PostType = {
  id: string
  title: string
  body: string
}

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  const posts = fetch('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.json() as Promise<PostType[]>)
    .then((r) => r.slice(0, 10))

  return posts
}

const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${postId}`,
  ).then((r) => r.json() as Promise<PostType>)

  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`)
  }

  return post
}

const rootRoute = new RootRoute({
  component: () => {
    return (
      <>
        <div class="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              class: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to={'/posts'}
            activeProps={{
              class: 'font-bold',
            }}
          >
            Posts
          </Link>
        </div>
        <hr />
        <Outlet />
      </>
    )
  },
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return (
      <div class="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  key: false,
  loader: fetchPosts,
  component: ({ useLoader }) => {
    const posts = useLoader()

    const items = () => [
      ...posts,
      { id: 'i-do-not-exist', title: 'Non-existent Post' },
    ]
    return (
      <div class="p-2 flex gap-2">
        <ul class="list-disc pl-4">
          <For each={items()}>
            {(post) => (
              <li class="whitespace-nowrap">
                <Link
                  to={postRoute.to}
                  params={{
                    postId: post.id,
                  }}
                  class="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ class: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )}
          </For>
        </ul>
        <hr />
        <Outlet />
      </div>
    )
  },
})

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => <div>Select a post.</div>,
})

class NotFoundError extends Error {}

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  key: false,
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>
    }

    return <ErrorComponent error={error} />
  },
  component: ({ useLoader }) => {
    const post = useLoader()

    return (
      <div class="space-y-2">
        <h4 class="text-xl font-bold underline">{post.title}</h4>
        <div class="text-sm">{post.body}</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Set up a Router instance
const router = new Router({
  routeTree,
  defaultPreload: 'intent',
})

// Register things for typesafety
// declare module '@tanstack/router' {
//   interface Register {
//     router: typeof router
//   }
// }

const root = document.getElementById('root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  )
}

render(() => <RouterProvider router={router} />, root!)
