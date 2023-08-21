import { FileRoute } from '@tanstack/react-router'
import { fetchPost, PostComponent, PostErrorComponent } from './posts.$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

// 'posts/$postId' is automatically inserted and managed
// by the `tsr generate/watch` CLI command
export const route = new FileRoute('/posts_/$postId/deep').createRoute({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: PostErrorComponent as any,
  component: PostComponent,
})
