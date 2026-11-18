import { defineComponent } from 'vue'
import { Link, getRouteApi } from '@tanstack/vue-router'

const postRoute = getRouteApi('/_authed/posts/$postId')

export const PostHeader = defineComponent({
  setup() {
    const data = postRoute.useLoaderData()
    const context = postRoute.useRouteContext()
    const search = postRoute.useSearch()
    const params = postRoute.useParams()

    return () => (
      <header>
        <h1>{data.value.post.title}</h1>
        {data.value.post.status === 'draft' ? <span>Draft</span> : null}
        {data.value.post.authorId === context.value.user.id ? (
          <span>Written by you</span>
        ) : null}
        <Link
          to="/posts/$postId"
          params={{ postId: params.value.postId }}
          search={{
            tab: search.value.tab === 'details' ? 'comments' : 'details',
          }}
        >
          {search.value.tab === 'details' ? 'Show comments' : 'Show details'}
        </Link>
      </header>
    )
  },
})
