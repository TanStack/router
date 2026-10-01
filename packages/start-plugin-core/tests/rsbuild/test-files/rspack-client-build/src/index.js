import './root.css'
import { runtime } from './shared/runtime-shared.js'

export const app = {
  runtime,
  posts: () =>
    import(
      /* webpackChunkName: "posts" */ './routes/posts.js?tsr-split=component'
    ),
  // Only the component split uses posts-helper, allowing production concatenation.
  postsError: () =>
    import(
      /* webpackChunkName: "posts", webpackExports: ["errorComponent"] */ './routes/posts.js?tsr-split=errorComponent'
    ),
  post: () =>
    import(
      /* webpackChunkName: "post" */ './routes/post.js?tsr-split=component'
    ),
  about: () =>
    import(
      /* webpackChunkName: "about" */ './routes/about.js?tsr-split=component'
    ),
  settings: () =>
    import(
      /* webpackChunkName: "settings" */ './routes/settings.js?tsr-split=component'
    ),
  plain: () => import(/* webpackChunkName: "plain" */ './lazy/plain.js'),
  notes: () =>
    import(/* webpackChunkName: "notes" */ './lazy/tsr-split-notes.js'),
}
globalThis.fixtureApp = app
