import { useQuery } from '@tanstack/vue-query'
import { Link, Outlet, createFileRoute } from '@tanstack/vue-router'
import { defineComponent } from 'vue'
import { postsQueryOptions } from '~/utils/posts'

const PostsComponent = defineComponent({
  setup() {
    const postsQuery = useQuery(postsQueryOptions())

    return () => {
      if (postsQuery.isLoading.value && !postsQuery.data.value) {
        return (
          <div class="p-2 flex gap-2">
            <div>Loading posts...</div>
          </div>
        )
      }

      const posts = [
        ...(postsQuery.data.value ?? []),
        { id: 'i-do-not-exist', title: 'Non-existent Post' },
      ]

      return (
        <div class="p-2 flex gap-2">
          <ul class="list-disc pl-4">
            {posts.map((post) => (
              <li class="whitespace-nowrap" key={post.id}>
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  class="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ class: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            ))}
          </ul>
          <hr />
          <Outlet />
        </div>
      )
    }
  },
})

export const Route = createFileRoute('/posts')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(postsQueryOptions())
  },
  head: () => ({ meta: [{ title: 'Posts' }] }),
  component: PostsComponent,
})
