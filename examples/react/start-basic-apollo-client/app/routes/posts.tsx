import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { gql, useReadQuery } from '@apollo/client/index.js'
import type { TypedDocumentNode } from '@apollo/client/index.js'

const GET_POSTS: TypedDocumentNode<{
  posts: {
    data: Array<{
      id: string
      title: string
    }>
  }
}> = gql`
  query GetPosts {
    posts {
      data {
        id
        title
      }
    }
  }
`

export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    console.log('executing loader')
    const postsRef = context.queryPreloader(GET_POSTS)
    console.log('loader', {
      postsRef,
      symbols: Object.getOwnPropertySymbols(postsRef),
    })
    return { postsRef }
  },
  component: PostsComponent,
})

function logStream(stream: ReadableStream, prefix: string) {
  if (!stream) {
    console.log(prefix + ' no stream')
    return
  }
  if (!stream.locked) {
    // @ts-ignore asd
    console.log(prefix + ' consuming', stream, id(stream))
    const textDecoder = new TextDecoder('utf-8')

    const reader = stream.getReader()
    const read = (): any => {
      return reader.read().then(({ done, value }) => {
        if (done) {
          console.log(prefix + ' done')
          return
        }
        if (value) {
          console.log(
            prefix + ' reading',
            typeof value === 'string'
              ? value
              : textDecoder.decode(value.buffer),
          )
        }

        return read()
      })
    }
    read()
  } else {
    console.log(prefix + ' stream locked')
  }
}

function PostsComponent() {
  const { postsRef } = Route.useLoaderData()
  console.log('PostsComponent', {
    postsRef,
    symbols: Object.getOwnPropertySymbols(postsRef),
  })

  const posts = useReadQuery(postsRef).data.posts.data

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }].map(
          (post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
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
          },
        )}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
