import { vendorA } from '../shared/vendor-a.js'
import { bigShared } from '../shared/big-shared.js'

export const post = () => vendorA + bigShared
export const counter = () =>
  import(
    // @ts-expect-error Rspack resolves resource queries in this fixture input.
    /* webpackChunkName: "counter" */ '../islands/counter.js?tss-hydrate=counter'
  )
export const chart = () =>
  import(
    // @ts-expect-error Rspack resolves resource queries in this fixture input.
    /* webpackChunkName: "chart" */ '../islands/chart.js?tss-hydrate=chart'
  )
