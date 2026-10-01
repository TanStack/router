// @ts-ignore Rspack handles CSS imports; only newer TypeScript versions check them.
import './posts.css'
// @ts-ignore Rspack handles CSS imports; only newer TypeScript versions check them.
import '../shared/shared-styles.css'
import { vendorA } from '../shared/vendor-a.js'
import { vendorB } from '../shared/vendor-b.js'
import { postsHelper } from './posts-helper.js'

export const errorComponent = 'posts-error'
export const posts = () => postsHelper(vendorA + vendorB)
export const counter = () =>
  import(
    // @ts-expect-error Rspack resolves resource queries in this fixture input.
    /* webpackChunkName: "counter" */ '../islands/counter.js?tss-hydrate=counter'
  )
