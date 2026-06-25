import type { ControlFlowBranch } from '../../shared'

export {
  parseControlFlowParams as parseFlowParams,
  stringifyControlFlowParams as stringifyFlowParams,
} from '../../shared'

type MarkerProps = {
  branch: ControlFlowBranch
  value: string
  checksum?: number
}

export function ControlFlowMarker(props: MarkerProps) {
  return (
    <main
      data-control-flow-branch={props.branch}
      data-control-flow-value={props.value}
      data-control-flow-checksum={props.checksum}
    />
  )
}

export function EmptyPage() {
  return null
}
