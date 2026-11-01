import * as React from 'react'
import { fetchPosts } from '../posts'
const postsLoader = {
  handler: () => fetchPosts(),
  staleReloadMode: 'background',
}
export { postsLoader }
