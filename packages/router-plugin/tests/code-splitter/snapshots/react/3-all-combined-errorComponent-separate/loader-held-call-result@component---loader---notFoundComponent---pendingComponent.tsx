import { makeLoader } from '../loaders'
// a call result may be an object-form loader: split with the mark
const postsLoader = makeLoader('/posts')
export { postsLoader as loader }
const SplitComponent = () => <p>posts</p>
export { SplitComponent as component }
