export const tsrSplit = 'tsr-split'

export const splitRouteIdentNodes = [
  'loader',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
] as const
export type SplitRouteIdentNodes = (typeof splitRouteIdentNodes)[number]
export type CodeSplitGroupings = Array<Array<SplitRouteIdentNodes>>

export const defaultCodeSplitGroupings: CodeSplitGroupings = [
  ['component'],
  ['errorComponent'],
  ['notFoundComponent'],
]
