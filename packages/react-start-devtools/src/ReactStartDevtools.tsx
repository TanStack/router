
import { createReactPanel } from '@tanstack/devtools-utils/react'
import { StartDevtoolsCore } from "@tanstack/start-devtools"
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/react';

export interface StartDevtoolsReactInit extends DevtoolsPanelProps { }

const [StartDevtoolsPanel, StartDevtoolsPanelNoOp] = createReactPanel(StartDevtoolsCore)

export { StartDevtoolsPanel, StartDevtoolsPanelNoOp }