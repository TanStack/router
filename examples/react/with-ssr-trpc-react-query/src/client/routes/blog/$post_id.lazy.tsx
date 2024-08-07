import {
  createLazyFileRoute,
  type RouteComponent,
} from '@tanstack/react-router'

import trpc from '../../utils/trpc'

export const Component: RouteComponent = () => {
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

export const Route = createLazyFileRoute('/blog/$post_id')({
  component: Component,
})
