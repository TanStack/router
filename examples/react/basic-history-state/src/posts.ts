import axios from 'redaxios'

export class NotFoundError extends Error {}

type PostType = {
  id: number
  title: string
  body: string
}

export const fetchPosts = async () => {
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

export const fetchPost = async (postId: number) => {
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .catch((err) => {
      if (err.status === 404) {
        throw new Error(`Post with id "${postId}" not found!`)
      }
      throw err
    })
    .then((r) => r.data)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`)
  }
  return post
}
