import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'
import { ssrSchema } from '~/search'

export const Route = createFileRoute('/posts/$postId')({
  validateSearch: z.object({ postId: ssrSchema }),
  ssr: ({ search }) => {
    if (typeof window !== 'undefined') {
      const error = `ssr() for ${Route.id} should not be called on the client`
      console.error(error)
      throw new Error(error)
    }
    if (search.status === 'success') {
      return search.value.postId?.ssr
    }
  },
  beforeLoad: ({ search }) => {
    if (typeof window !== 'undefined') {
      if (Route.options.ssr !== undefined) {
        const error = `ssr() for ${Route.id} should have been deleted from the Route options on the client`
        console.error(error)
        throw new Error(error)
      }
    }
    console.log(
      `beforeLoad for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )
    if (
      search.postId?.expected?.data === 'client' &&
      typeof window === 'undefined'
    ) {
      const error = `Expected beforeLoad for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    return {
      postId: typeof window === 'undefined' ? 'server' : 'client',
      search,
    }
  },
  loader: ({ context }) => {
    console.log(
      `loader for ${Route.id} called on the ${typeof window !== 'undefined' ? 'client' : 'server'}`,
    )

    if (
      context.search.postId?.expected?.data === 'client' &&
      typeof window === 'undefined'
    ) {
      const error = `Expected loader for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    return { postId: typeof window === 'undefined' ? 'server' : 'client' }
  },
  component: () => {
    const search = Route.useSearch()
    if (
      typeof window === 'undefined' &&
      search.postId?.expected?.render === 'client-only'
    ) {
      const error = `Expected component for ${Route.id} to be executed on the client, but it is running on the server`
      console.error(error)
      throw new Error(error)
    }
    return (
      <div data-testid="postId-container">
        <h4 data-testid="postId-heading">postId</h4>
        <div>
          ssr:{' '}
          <b>{JSON.stringify(Route.useSearch().postId?.ssr ?? 'undefined')}</b>
        </div>
        <div>
          expected data location execution:{' '}
          <b data-testid="postId-data-expected">
            {Route.useSearch().postId?.expected?.data}
          </b>
        </div>
        <div>
          loader:{' '}
          <b data-testid="postId-loader">{Route.useLoaderData().postId}</b>
        </div>
        <div>
          context:{' '}
          <b data-testid="postId-context">{Route.useRouteContext().postId}</b>
        </div>
      </div>
    )
  },
})
