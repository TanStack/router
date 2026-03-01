import { notFound } from '@tanstack/angular-router-experimental'

export type PostType = {
  id: string
  title: string
  body: string
}

export const fetchPost = async (postId: string) => {
  console.info(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const res = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${postId}`,
  )
  if (res.status === 404) {
    throw notFound()
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<PostType>
}

export const fetchPosts = async () => {
  console.info('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  const res = await fetch('https://jsonplaceholder.typicode.com/posts')
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as PostType[]
  return data.slice(0, 10)
}
