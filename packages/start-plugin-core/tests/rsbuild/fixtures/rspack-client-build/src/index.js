// @ts-ignore Rspack handles CSS imports; only newer TypeScript versions check them.
import './root.css'
import { runtime } from './shared/runtime-shared.js'

export const app = {
  runtime,
  posts: () =>
    import(
      // @ts-expect-error Rspack resolves resource queries in this fixture input.
      /* webpackChunkName: "posts" */ './routes/posts.js?tsr-split=component'
    ),
  // Only the component split uses posts-helper, allowing production concatenation.
  postsError: () =>
    import(
      // @ts-expect-error Rspack resolves resource queries in this fixture input.
      /* webpackChunkName: "posts", webpackExports: ["errorComponent"] */ './routes/posts.js?tsr-split=errorComponent'
    ),
  post: () =>
    import(
      // @ts-expect-error Rspack resolves resource queries in this fixture input.
      /* webpackChunkName: "post" */ './routes/post.js?tsr-split=component'
    ),
  about: () =>
    import(
      // @ts-expect-error Rspack resolves resource queries in this fixture input.
      /* webpackChunkName: "about" */ './routes/about.js?tsr-split=component'
    ),
  settings: () =>
    import(
      // @ts-expect-error Rspack resolves resource queries in this fixture input.
      /* webpackChunkName: "settings" */ './routes/settings.js?tsr-split=component'
    ),
  plain: () => import(/* webpackChunkName: "plain" */ './lazy/plain.js'),
  notes: () =>
    import(/* webpackChunkName: "notes" */ './lazy/tsr-split-notes.js'),
}
Object.assign(globalThis, { fixtureApp: app })
