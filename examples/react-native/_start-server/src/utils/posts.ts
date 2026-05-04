// Shared mock data for the React Native Start examples. Replace with a real
// data source for anything beyond demo / e2e use.

export type Post = {
  id: string
  title: string
  body: string
  author: string
  createdAt: string
}

const POSTS: Array<Post> = [
  {
    id: '1',
    title: 'TanStack Router on React Native',
    body: 'Type-safe routing for native apps with the same primitives you know from the web.',
    author: 'tanstack',
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'Server Functions over the wire',
    body: 'createServerFn calls compile to typed RPC fetches in your RN bundle.',
    author: 'tanstack',
    createdAt: '2026-02-02T14:30:00Z',
  },
  {
    id: '3',
    title: 'Native stack lifecycle',
    body: 'Pause, resume, and reuse stack entries with declarative options.',
    author: 'tanstack',
    createdAt: '2026-03-12T09:15:00Z',
  },
  {
    id: '4',
    title: 'Deep linking that just works',
    body: 'tanstackrouter:// → /posts/1 → cold-start to the right screen.',
    author: 'tanstack',
    createdAt: '2026-04-20T16:45:00Z',
  },
]

export function listPostsData(): Array<Post> {
  return POSTS
}

export function getPostData(id: string): Post | null {
  return POSTS.find((p) => p.id === id) ?? null
}
