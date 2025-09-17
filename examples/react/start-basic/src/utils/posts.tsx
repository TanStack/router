import { notFound } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

export type PostType = {
  id: string
  title: string
  body: string
}

const mw = createMiddleware({ type: 'function' })
  .client(async ({ next, context }) => {
    console.log('Client middleware!', context)
    const result = await next({
      sendContext: {
        clientMiddlewareValue: 123,
      },
    })
    console.log('Client middleware after next!', result)
    return result
  })
  .server(async ({ next, context }) => {
    return next({
      context: {
        hello: 'from the server middleware!',
      },
    })
  })
export const fetchPost = createServerFn({ method: 'POST' })
  .middleware([mw])
  .validator((d: string) => d)
  .handler(async ({ data, context }) => {
    console.log('Request context:', context)
    console.info(`Fetching post with id ${data}...`)
    const res = await fetch(
      `https://jsonplaceholder.typicode.com/posts/${data}`,
    )
    if (!res.ok) {
      if (res.status === 404) {
        throw notFound()
      }

      throw new Error('Failed to fetch post')
    }

    const post = (await res.json()) as PostType

    return post
  })

export const fetchPosts = createServerFn().handler(async () => {
  console.info('Fetching posts...')
  const res = await fetch('https://jsonplaceholder.typicode.com/posts')
  if (!res.ok) {
    throw new Error('Failed to fetch posts')
  }

  const posts = (await res.json()) as Array<PostType>

  return posts.slice(0, 10)
})
