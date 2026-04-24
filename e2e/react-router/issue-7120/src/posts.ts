import axios from 'redaxios'

type PostType = {
  id: string
  title: string
  body: string
}

let queryURL = 'https://jsonplaceholder.typicode.com'

if (import.meta.env.VITE_NODE_ENV === 'test') {
  queryURL = `http://localhost:${import.meta.env.VITE_EXTERNAL_PORT}`
}

export const fetchPosts = async () => {
  return axios
    .get<Array<PostType>>(`${queryURL}/posts`)
    .then((r) => r.data.slice(0, 10))
}
