import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { SpanStatusCode } from '@opentelemetry/api'
import { tracer } from './tracer'

export type PostType = {
  id: number
  title: string
  body: string
}

export const fetchPost = createServerFn({ method: 'POST' })
  .inputValidator((d: string) => d)
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

    const post = await res.json()

    return post as PostType
  })

export const fetchPosts = createServerFn().handler(async () => {
  return tracer.startActiveSpan('fetchPosts', async (span) => {
    try {
    console.info('Fetching posts...')
    const res = await fetch('https://jsonplaceholder.typicode.com/posts')
    if (!res.ok) {
      throw new Error('Failed to fetch posts')
    }

    const posts = await res.json()

    span.setStatus({ code: SpanStatusCode.OK })
      return (posts as Array<PostType>).slice(0, 10)
    } catch (error: any) {
      span.recordException(error)
      throw error
    } finally {
      span.end()
    }
  })
})
