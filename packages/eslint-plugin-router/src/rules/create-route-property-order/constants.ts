export const createRouteFunctionsIndirect = [
  'createFileRoute',
  'createRootRouteWithContext',
] as const
export const createRouteFunctionsDirect = [
  'createRootRoute',
  'createRoute',
] as const

export const createRouteFunctions = [
  ...createRouteFunctionsDirect,
  ...createRouteFunctionsIndirect,
] as const

export type CreateRouteFunction = (typeof createRouteFunctions)[number]

export const checkedProperties = [
  'params',
  'validateSearch',
  'loaderDeps',
  'context',
  'beforeLoad',
  'loader',
] as const

export const sortRules = [
  [['params', 'validateSearch'], ['loaderDeps']],
  [['loaderDeps'], ['context']],
  [['context'], ['beforeLoad']],
  [['beforeLoad'], ['loader']],
] as const
