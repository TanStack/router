const authors = [
  { id: 1, name: 'Author 1' },
  { id: 2, name: 'Author 2' },
  { id: 3, name: 'Author 3' },
]

const comments = [
  { id: 1, body: 'Comment 1 body', authorId: 1 },
  { id: 2, body: 'Comment 2 body', authorId: 2 },
  { id: 3, body: 'Comment 3 body', authorId: 3 },
  { id: 4, body: 'Comment 4 body', authorId: 2 },
  { id: 5, body: 'Comment 5 body', authorId: 3 },
  { id: 6, body: 'Comment 6 body', authorId: 3 },
  { id: 7, body: 'Comment 7 body', authorId: 3 },
]

const posts = [
  { id: 1, title: 'Post 1', body: 'Post 1 body', authorId: 1, commentIds: [1] },
  {
    id: 2,
    title: 'Post 2',
    body: 'Post 2 body',
    authorId: 2,
    commentIds: [2, 4],
  },
  {
    id: 3,
    title: 'Post 3',
    body: 'Post 3 body',
    authorId: 3,
    commentIds: [3, 5, 6, 7],
  },
  { id: 4, title: 'Post 4', body: 'Post 4 body', authorId: 1, commentIds: [] },
]

function sleep(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const postById = async (id: number, withAuthor = false) => {
  await sleep(1000)
  const post = posts.find((post) => post.id === id)

  if (!post) throw new Error('Post not found')

  return {
    ...post,
    author: withAuthor
      ? authors.find((author) => author.id === post.authorId)
      : undefined,
  }
}

const postCreate = async (input: {
  title: string
  body: string
  authorId: number
}) => {
  await sleep(1000)
  const post = {
    id: posts.length + 1,
    commentIds: [],
    ...input,
  }
  posts.push(post)
  return post
}

const postList = async (withAuthor = false) => {
  await sleep(1000)
  return posts.map((post) => ({
    ...post,
    author: withAuthor
      ? authors.find((author) => author.id === post.authorId)
      : undefined,
  }))
}

const commentById = async (id: number) => {
  await sleep(1000 + id * 100) // different sleep time to showcase streaming
  const comment = comments.find((comment) => comment.id === id)

  if (!comment) throw new Error('Comment not found')

  return comment
}

export const db = {
  post: {
    byId: postById,
    create: postCreate,
    list: postList,
  },
  comment: {
    byId: commentById,
  },
}
