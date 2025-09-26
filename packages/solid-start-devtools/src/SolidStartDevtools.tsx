
import { createSolidPanel } from "@tanstack/devtools-utils/solid"
import { StartDevtoolsCore } from "@tanstack/start-devtools"
import type { DevtoolsPanelProps } from "@tanstack/devtools-utils/solid";

const [StartDevtoolsPanel, StartDevtoolsPanelNoOp] = createSolidPanel(StartDevtoolsCore)
export interface StartDevtoolsSolidInit extends DevtoolsPanelProps {
}

export { StartDevtoolsPanel, StartDevtoolsPanelNoOp }