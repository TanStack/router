import { routeOptionPieces } from '@tanstack/router-generator'

export const tsrSplit = 'tsr-split'

/**
 * The route options code splitting can split: what a split grouping may name
 * (`groupingsProblem`) and what the planner splits. The generator's route
 * file pieces (`routeOptionPieces`, the one list).
 */
export const splitRouteIdentNodes = routeOptionPieces
export type SplitRouteIdentNodes = (typeof splitRouteIdentNodes)[number]
export type CodeSplitGroupings = Array<Array<SplitRouteIdentNodes>>

export const defaultCodeSplitGroupings: CodeSplitGroupings = [
  ['component'],
  ['errorComponent'],
  ['notFoundComponent'],
]
