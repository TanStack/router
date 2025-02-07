export const splitPrefixes = {
  ROUTE_COMPONENT: 'tsr-split-component',
  ROUTE_LOADER: 'tsr-split-loader',
} as const

export type SplitPrefix = (typeof splitPrefixes)[keyof typeof splitPrefixes]

export const splitRouteIdentNodeMap = {
  component: 'component',
  loader: 'loader',
} as const
export const splitRouteIdentNodes = [
  ...Object.values(splitRouteIdentNodeMap),
] as const
export type SplitRouteIdentNodes = (typeof splitRouteIdentNodes)[number]
