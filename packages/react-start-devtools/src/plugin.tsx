import { createReactPlugin } from '@tanstack/devtools-utils/react'
import { StartDevtoolsPanel } from './ReactStartDevtools'

const [startDevtoolsPlugin, startDevtoolsNoOpPlugin] = createReactPlugin("TanStack Start", StartDevtoolsPanel)

export { startDevtoolsPlugin, startDevtoolsNoOpPlugin }