import * as React from 'react'
import { Link, Outlet, Route } from '@tanstack/react-router'
import { rootRoute } from './root'
import { postIdRoute } from './posts/$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsLoader = new Loader({
  key: 'posts',
  fn: async () => {
    console.log('Fetching posts...')
    await new Promise((r) =>
      setTimeout(r, 500 + Math.round(Math.random() * 300)),
    )

    return fetch('https://jsonplaceholder.typicode.com/posts')
      .then((d) => d.json() as Promise<PostType[]>)
      .then((d) => d.slice(0, 10))
  },
})

export const testLoader = new Loader({
  key: 'test',
  fn: async (wait: number) => {
    await new Promise((r) => setTimeout(r, wait))
    return {
      test: new Date().toLocaleString(),
    }
  },
})

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: async ({ context: { loaderClient }, preload }) => {
    await loaderClient.load({ key: 'posts', preload })
  },
  component: function Posts() {
    const { data: posts } = useLoaderInstance({ key: 'posts' })

    return (
      <div className="p-2 flex gap-2">
        <Test wait={1000 / 2} />
        <Test wait={3000 / 2} />
        <Test wait={2000 / 2} />
        <Test wait={5000 / 2} />
        <Test wait={4000 / 2} />
        <ul className="list-disc pl-4">
          {posts?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postIdRoute.to}
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    )
  },
})

function Test({ wait }: { wait: number }) {
  return (
    <React.Suspense fallback={<div>...</div>}>
      <TestInner wait={wait} />
    </React.Suspense>
  )
}

function TestInner({ wait }: { wait: number }) {
  const instance = useLoaderInstance({
    key: 'test',
    variables: wait,
  })

  return <div>Test: {instance.data.test}</div>
}
