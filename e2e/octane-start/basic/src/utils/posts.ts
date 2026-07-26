import { notFound } from '@tanstack/octane-router'
import { createServerFn } from '@tanstack/octane-start'

export type Post = {
  id: string
  title: string
  body: string
}

const posts: Array<Post> = [
  {
    id: '1',
    title: 'First post',
    body: 'Body of the first post.',
  },
  {
    id: '2',
    title: 'Second post',
    body: 'Body of the second post.',
  },
]

export const fetchPosts = createServerFn({ method: 'GET' }).handler(
  async () => posts,
)

export const fetchPost = createServerFn({ method: 'GET' })
  .validator((postId: string) => postId)
  .handler(async ({ data: postId }: { data: string }) => {
    const post = posts.find((candidate) => candidate.id === postId)
    if (!post) {
      throw notFound()
    }

    return post
  })
