import './posts.css'
import '../shared/shared-styles.css'
import { vendorA } from '../shared/vendor-a.js'
import { vendorB } from '../shared/vendor-b.js'
import { postsHelper } from './posts-helper.js'

export const errorComponent = 'posts-error'
export const posts = () => postsHelper(vendorA + vendorB)
export const counter = () =>
  import(
    /* webpackChunkName: "counter" */ '../islands/counter.js?tss-hydrate=counter'
  )
