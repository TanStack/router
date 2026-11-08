export const tsrSplit = 'tsr-split'

/**
 * The route options code splitting can split: what a split grouping may name
 * (`groupingsProblem`) and what the planner splits. The one list.
 */
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
