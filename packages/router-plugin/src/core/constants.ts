export const splitPrefixes = {
  ROUTE_COMPONENT: 'tsr-split-component',
  ROUTE_LOADER: 'tsr-split-loader',
} as const

export type SplitPrefix = (typeof splitPrefixes)[keyof typeof splitPrefixes]

export const splitRouteIdentNodes = ['component', 'loader'] as const
export type SplitRouteIdentNodes = (typeof splitRouteIdentNodes)[number]
export type SplitGroupings = Array<Array<SplitRouteIdentNodes>>

const _defaultCodeSplitGroupings: SplitGroupings = [['component']]
