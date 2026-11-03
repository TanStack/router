/**
 * Inline post data for testing - no external API needed
 */
export interface Post {
  id: number
  title: string
  body: string
}

export interface Comment {
  id: number
  postId: number
  author: string
  text: string
}

export const posts: Array<Post> = [
  { id: 1, title: 'First Post', body: 'This is the first post body.' },
  { id: 2, title: 'Second Post', body: 'This is the second post body.' },
  { id: 3, title: 'Third Post', body: 'This is the third post body.' },
]

export const comments: Array<Comment> = [
  { id: 1, postId: 1, author: 'Alice', text: 'Great first post!' },
  { id: 2, postId: 1, author: 'Bob', text: 'Welcome to the blog.' },
  { id: 3, postId: 2, author: 'Charlie', text: 'Interesting read.' },
  { id: 4, postId: 3, author: 'Dave', text: 'Thanks for sharing.' },
]

export function getPost(id: number): Post | undefined {
  return posts.find((p) => p.id === id)
}

export function getPostComments(postId: number): Array<Comment> {
  return comments.filter((c) => c.postId === postId)
}
