export const splitPrefixes = {
  ROUTE_COMPONENT: 'tsr-split-component',
  ROUTE_LOADER: 'tsr-split-loader',
} as const

export type SplitPrefix = (typeof splitPrefixes)[keyof typeof splitPrefixes]
