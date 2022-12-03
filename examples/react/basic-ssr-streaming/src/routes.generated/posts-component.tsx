import * as React from 'react'
import { Outlet, useMatch } from '@tanstack/react-router'
import { routeConfig } from './posts'
function Posts() {
  const {
    loaderData: { posts },
    Link,
  } = useMatch(routeConfig.id)
  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
      }}
    >
      <div>
        {posts?.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to="/posts/$postId"
                params={{
                  postId: post.id,
                }}
                activeProps={{
                  className: 'font-bold',
                }}
              >
                <pre>{post.title.substring(0, 20)}</pre>
              </Link>
            </div>
          )
        })}
      </div>
      <Outlet />
    </div>
  )
}
export const component = Posts
