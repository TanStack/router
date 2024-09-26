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
  'context',
  'beforeLoad',
  'loaderDeps',
  'loader',
] as const

export const sortRules = [
  [['params', 'validateSearch'], ['context']],
  [['context'], ['beforeLoad']],
  [['beforeLoad'], ['loaderDeps']],
  [['loaderDeps'], ['loader']],
] as const
