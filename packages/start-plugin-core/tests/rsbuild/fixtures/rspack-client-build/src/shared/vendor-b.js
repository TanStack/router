export const vendorB = 'vendor-b'
export const tooltip = () =>
  import(
    // @ts-expect-error Rspack resolves resource queries in this fixture input.
    /* webpackChunkName: "tooltip" */ '../islands/tooltip.js?tss-hydrate=tooltip'
  )
