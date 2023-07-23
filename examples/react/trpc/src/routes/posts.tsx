import { Link, Outlet, Route } from '@tanstack/router'
import { rootRoute } from './root'
import { postIdRoute } from './posts/$postId'

declare module 'react' {
  function use<T>(promise: Promise<T>): T
}

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: async ({ context: { ssg } }) => {
    await ssg.postList.prefetch()
  },
  component: function Posts({ useContext }) {
    const { trpc } = useContext()
    const { data: posts } = trpc.postList.useQuery()

    console.log('posts', posts)

    return (
      <div className="p-2 flex gap-2">
        {/* <Test wait={1000 / 2} />
        <Test wait={2000 / 2} />
        <Test wait={3000 / 2} />
        <Test wait={4000 / 2} />
        <Test wait={5000 / 2} /> */}
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

// function Test({ wait }: { wait: number }) {
//   return (
//     <React.Suspense fallback={<div>...</div>}>
//       <TestInner wait={wait} />
//     </React.Suspense>
//   );
// }

// function TestInner({ wait }: { wait: number }) {
//   const instance = testLoader.useLoader({
//     variables: wait,
//   });

//   return <div>Test: {instance.state.data.test}</div>;
// }
