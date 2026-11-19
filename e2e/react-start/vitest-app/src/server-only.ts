// Stands for code that must never load in a browser: a database client, a
// secret, a Node API. Loading it leaves a mark that tests can look for.
declare global {
  var __SERVER_ONLY_MODULE_LOADED__: boolean | undefined
}

globalThis.__SERVER_ONLY_MODULE_LOADED__ = true

export function readSecret() {
  return 'the server secret'
}

export type Locale = 'en' | 'de'

export interface Post {
  id: string
  title: string
}

export interface User {
  id: string
  name: string
}

const posts = new Map<string, Record<Locale, string>>([
  ['1', { en: 'The first post', de: 'Der erste Beitrag' }],
  ['2', { en: 'The second post', de: 'Der zweite Beitrag' }],
  ['3', { en: 'The third post', de: 'Der dritte Beitrag' }],
])
const users = new Map<string, User>([['ada', { id: 'u1', name: 'Ada' }]])
const likes = new Map<string, Set<string>>()
const calls: Array<string> = []

export function countPosts(): number {
  return posts.size
}

export function findPost(id: string, locale: Locale): Post | undefined {
  const titles = posts.get(id)
  return titles && { id, title: titles[locale] }
}

/** The user of a session cookie. */
export function findUserBySession(session: string | undefined) {
  return session ? users.get(session) : undefined
}

/** Counts each user once. Returns the number of likes of the post. */
export function addLike(postId: string, userId: string): number {
  const users = likes.get(postId) ?? new Set()
  likes.set(postId, users.add(userId))
  return users.size
}

/** The audit log of the app: the server functions that were called. */
export function recordCall(name: string) {
  calls.push(name)
}

export function recordedCalls(): ReadonlyArray<string> {
  return calls
}
