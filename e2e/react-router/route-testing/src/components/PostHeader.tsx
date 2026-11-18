import { Link, getRouteApi } from '@tanstack/react-router'

const postRoute = getRouteApi('/_authed/posts/$postId')

export function PostHeader() {
  const { post } = postRoute.useLoaderData()
  const { user } = postRoute.useRouteContext()
  const { tab } = postRoute.useSearch()
  const { postId } = postRoute.useParams()

  return (
    <header>
      <h1>{post.title}</h1>
      {post.status === 'draft' ? <span>Draft</span> : null}
      {post.authorId === user.id ? <span>Written by you</span> : null}
      <Link
        to="/posts/$postId"
        params={{ postId }}
        search={{ tab: tab === 'details' ? 'comments' : 'details' }}
      >
        {tab === 'details' ? 'Show comments' : 'Show details'}
      </Link>
    </header>
  )
}
