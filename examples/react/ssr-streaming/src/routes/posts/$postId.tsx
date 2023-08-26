import { Await, defer, Route, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { CommentType, postsRoute, PostType } from '../posts'

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`)

  await new Promise((r) => setTimeout(r, 100 + Math.round(Math.random() * 100)))

  return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
    (r) => r.json() as Promise<PostType>,
  )
}

async function fetchComments(postId: string) {
  await new Promise((r) => setTimeout(r, 1000))

  return fetch(
    `https://jsonplaceholder.typicode.com/comments?postId=${postId}`,
  ).then((r) => r.json() as Promise<CommentType[]>)
}

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ params: { postId } }) => {
    const commentsPromise = fetchComments(postId)
    const post = await fetchPostById(postId)

    return {
      post,
      commentsPromise: defer(commentsPromise),
    }
  },
  component: function Post({ useLoader }) {
    const { post, commentsPromise } = useLoader()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
        <React.Suspense fallback={<div>Loading comments...</div>}>
          <Await promise={commentsPromise}>
            {(comments) => {
              return (
                <div className="space-y-2">
                  <h5 className="text-lg font-bold underline">Comments</h5>
                  {comments?.map((comment) => {
                    return (
                      <div key={comment.id}>
                        <h6 className="text-md font-bold">{comment.name}</h6>
                        <div className="text-sm italic opacity-50">
                          {comment.email}
                        </div>
                        <div className="text-sm">{comment.body}</div>
                      </div>
                    )
                  })}
                </div>
              )
            }}
          </Await>
        </React.Suspense>
      </div>
    )
  },
})
