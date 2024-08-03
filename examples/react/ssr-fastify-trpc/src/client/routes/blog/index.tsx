import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/blog/')({
  component: () => {
    const { blog_posts } = Route.useLoaderData()

    return (
      <main>
        <h1>Blog</h1>
        <ol>
          {blog_posts.map((bp) => (
            <li key={bp.id}>
              <Link to="/blog/$post_id" params={{ post_id: bp.id }}>
                {bp.title}
              </Link>
            </li>
          ))}
          <li>
            <Link to="/blog/$post_id" params={{ post_id: 'c3' }}>
              Nonexistent Post
            </Link>
          </li>
        </ol>
      </main>
    )
  },
  async loader({ abortController, context: { caller, trpcQueryUtils } }) {
    return {
      blog_posts: caller
        ? await (async () => {
            const result = await caller.blog.getAllPosts()
            // set the value in the cache so it gets dehydrated / hydrated by the router
            trpcQueryUtils.blog.getAllPosts.setData(undefined, result)
            return result
          })()
        : await trpcQueryUtils.blog.getAllPosts.ensureData(undefined, {
            signal: abortController.signal,
          }),
    }
  },
})
