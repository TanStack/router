import { fetchPosts } from '../posts'
const postsLoader = {
  handler: () => fetchPosts(),
  staleReloadMode: 'background',
}
export { postsLoader }
