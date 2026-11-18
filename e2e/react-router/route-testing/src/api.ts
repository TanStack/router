export interface User {
  id: string
  name: string
}

export interface Session {
  user: User | null
}

export interface Post {
  id: string
  title: string
  authorId: string
  status: 'draft' | 'published'
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function fetchSession() {
  return getJson<Session>('/api/session')
}

export function fetchUnreadCount() {
  return getJson<number>('/api/notifications/unread-count')
}

export function fetchPost(postId: string) {
  return getJson<Post>(`/api/posts/${postId}`)
}
