import { createSolidPlugin } from '@tanstack/devtools-utils/solid'
import { StartDevtoolsPanel } from './SolidStartDevtools'

const [startDevtoolsPlugin, startDevtoolsNoOpPlugin] = createSolidPlugin("TanStack Start", StartDevtoolsPanel)

export { startDevtoolsPlugin, startDevtoolsNoOpPlugin }