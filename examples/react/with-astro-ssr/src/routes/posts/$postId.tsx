import { useLoaderInstance } from '@tanstack/react-loaders'
import { Route, useParams } from '@tanstack/react-router'
import { postsRoute } from '../posts'

export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  onLoad: async ({ params: { postId }, preload, context }) =>
    context.loaderClient.getLoader({ key: 'post' }).load({
      variables: postId,
      preload,
    }),
  component: Post,
  getContext: ({ context, params: { postId } }) => ({
    getTitle: () =>
      context.loaderClient.getLoader({ key: 'post' }).getInstance({
        variables: postId,
      }).state.data?.title,
  }),
})

function Post() {
  const { postId } = useParams({ from: postIdRoute.id })

  const {
    state: { data: post },
  } = useLoaderInstance({ key: 'post', variables: postId })

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
