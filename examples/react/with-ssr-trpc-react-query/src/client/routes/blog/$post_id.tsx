import { createFileRoute, notFound } from '@tanstack/react-router'
import { TRPCClientError } from '@trpc/client'

import { TRPCError } from '@trpc/server'

import trpc from '../../utils/trpc'
import type { AppRouter } from '../../trpc'

export const Route = createFileRoute('/blog/$post_id')({
  component: PostIdComponent,
  async loader({
    abortController,
    context: { caller, trpcQueryUtils },
    params: { post_id },
  }) {
    try {
      return {
        blog_post: caller
          ? await (async () => {
              const result = await caller.blog.getPostByID(post_id)
              // set the value in the cache so it gets dehydrated / hydrated by the router
              trpcQueryUtils.blog.getPostByID.setData(post_id, result)
              return result
            })()
          : await trpcQueryUtils.blog.getPostByID.ensureData(post_id, {
              signal: abortController.signal,
            }),
      }
    } catch (error) {
      if (
        (error instanceof TRPCClientError &&
          (error as TRPCClientError<AppRouter>).data?.code === 'NOT_FOUND') ||
        (error instanceof TRPCError && error.code === 'NOT_FOUND')
      )
        throw notFound({ data: error.message })

      throw error
    }
  },
  meta({ loaderData: { blog_post } }) {
    /** @see https://ogp.me/#no_vertical */
    const {
      category,
      expiration_time,
      last_updated,
      published_time,
      subtitle,
      tags,
      title,
    } = blog_post
    return [
      { title },
      {
        content: title,
        name: 'title',
      },
      {
        content: 'article',
        property: 'og:type',
      },
      {
        content: category,
        property: 'og:article:section',
      },
      {
        content: title,
        property: 'og:title',
      },
      {
        content: subtitle,
        property: 'og:description',
      },
      {
        content: published_time.toISOString(),
        property: 'og:article:published_time',
      },
      {
        content: last_updated.toISOString(),
        property: 'og:article:modified_time',
      },
      ...(expiration_time
        ? [
            {
              content: expiration_time.toISOString(),
              property: 'og:article:expiration_time',
            },
          ]
        : []),
      ...tags.map((tag) => ({
        content: tag,
        property: 'og:article:tag',
      })),
      {
        content: title,
        name: 'twitter:title',
      },
      {
        content: subtitle,
        name: 'twitter:description',
      },
    ]
  },
})

function PostIdComponent() {
  const { post_id } = Route.useParams()
  const [{ content, last_updated, published_time, subtitle, title }] =
    trpc.blog.getPostByID.useSuspenseQuery(post_id)

  return (
    <main>
      <h1>{title}</h1>
      <h2>{subtitle}</h2>
      <h3>{`Originally Published: ${published_time.toLocaleString()}`}</h3>
      <h3>{`Last Updated: ${last_updated.toLocaleString()}`}</h3>
      <p>{content}</p>
    </main>
  )
}
