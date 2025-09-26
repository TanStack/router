
import { constructCoreClass } from '@tanstack/devtools-utils/solid'
import { lazy } from 'solid-js'

const Component = lazy(() => import('./StartDevtools'))

export interface StartDevtoolsInit { }

const [StartDevtoolsCore, StartDevtoolsCoreNoOp] = constructCoreClass(Component)

export { StartDevtoolsCore, StartDevtoolsCoreNoOp }