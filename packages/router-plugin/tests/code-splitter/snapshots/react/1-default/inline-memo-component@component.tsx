import { memo } from 'react'
const SplitComponent = memo(() => {
  const label: string = 'Inline memo component'
  return <div>{label}</div>
})
export { SplitComponent as component }
