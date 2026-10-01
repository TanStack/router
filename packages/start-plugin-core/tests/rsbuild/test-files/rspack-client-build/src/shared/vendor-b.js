export const vendorB = 'vendor-b'
export const tooltip = () =>
  import(
    /* webpackChunkName: "tooltip" */ '../islands/tooltip.js?tss-hydrate=tooltip'
  )
