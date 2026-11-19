// Stands for code that must never load in a browser: a database client, a
// secret, a Node API. Loading it leaves a mark that tests can look for.
declare global {
  var __SERVER_ONLY_MODULE_LOADED__: boolean | undefined
}

globalThis.__SERVER_ONLY_MODULE_LOADED__ = true

export function readSecret() {
  return 'the server secret'
}

export interface Post {
  id: string
  title: string
}

const posts = new Map<string, Post>([
  ['1', { id: '1', title: 'The first post' }],
])
const likes = new Map<string, number>()

export function findPost(id: string): Post | undefined {
  return posts.get(id)
}

export function addLike(postId: string): number {
  const count = (likes.get(postId) ?? 0) + 1
  likes.set(postId, count)
  return count
}
