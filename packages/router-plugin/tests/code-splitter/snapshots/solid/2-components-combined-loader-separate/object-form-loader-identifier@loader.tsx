import { fetchPosts } from '../posts'
function loadPosts() {
  return fetchPosts()
}
export { loadPosts as loader }
