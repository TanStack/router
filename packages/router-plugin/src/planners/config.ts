import type { CodeSplitGroupings } from '../core/constants'

export type HmrStyle = 'vite' | 'webpack'

/**
 * The configuration both router planners read (one object shared by
 * `route-split` and `route-hmr`, so that the HMR hoists know which options
 * the splitter moves).
 */
export interface RouterPlannerConfig {
  framework: 'react' | 'solid' | 'vue'
  /** Whether route options are split (`autoCodeSplitting`); `deleteNodes` applies regardless. */
  split: boolean
  defaultGroupings: CodeSplitGroupings
  splitBehavior?:
    | ((params: { routeId: string }) => CodeSplitGroupings | undefined | void)
    | undefined
  deleteNodes: ReadonlyArray<string>
  hmr: {
    /** Whether the host wants route HMR at all (`addHmr`); the planner also requires a dev client env. */
    enabled: boolean
    style: HmrStyle
  }
}
