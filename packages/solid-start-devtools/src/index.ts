
import * as Devtools from './SolidStartDevtools'
import * as plugin from './plugin'

export const StartDevtoolsPanel =
  process.env.NODE_ENV !== 'development'
    ? Devtools.StartDevtoolsPanelNoOp
    : Devtools.StartDevtoolsPanel

export const startDevtoolsPlugin =
  process.env.NODE_ENV !== 'development'
    ? plugin.startDevtoolsNoOpPlugin
    : plugin.startDevtoolsPlugin

export type { StartDevtoolsSolidInit } from './SolidStartDevtools'
