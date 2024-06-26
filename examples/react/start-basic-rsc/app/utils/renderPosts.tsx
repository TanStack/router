'use server'

import React from 'react'
import { fetchPosts } from './posts'

export async function renderPosts() {
  const posts = await fetchPosts()

  posts.state = posts.state || {
    status: 'pending',
    promise: Promise.resolve(),
  }

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }]?.map(
          (post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                {post.title.substring(0, 20)}
                {/* <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link> */}
              </li>
            )
          },
        )}
      </ul>
      <hr />
      <React.Suspense fallback={<div>Loading...</div>}>
        <DelayedDateViaSuspense state={posts.state} />
      </React.Suspense>
    </div>
  )
}

function DelayedDateViaSuspense({ state }) {
  // a component that will suspend for 1 second and then show the current date
  if (state.status === 'pending') {
    state.promise = new Promise<void>((resolve) => {
      setTimeout(() => {
        state.status = 'success'
        resolve()
      }, 5000)
    })
    throw state.promise
  }

  return <div>{new Date().toISOString().replace('T', ' ').split('.')[0]}</div>
}

// ...fetchPosts
// posts
// ...5000
// timestamp
