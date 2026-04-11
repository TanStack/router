export { configSchema, getConfig } from './core/config'
export { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin'
export { unpluginRouterGeneratorFactory } from './core/router-generator-plugin'
export type {
  Config,
  ConfigInput,
  ConfigOutput,
  CodeSplittingOptions,
  DeletableNodes,
  HmrOptions,
} from './core/config'
export {
  tsrSplit,
  splitRouteIdentNodes,
  defaultCodeSplitGroupings,
} from './core/constants'
