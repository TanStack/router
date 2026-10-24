import * as React from 'react'
import { fetchPosts } from '../posts'
function loadPosts() {
  return fetchPosts()
}
export { loadPosts as loader }
