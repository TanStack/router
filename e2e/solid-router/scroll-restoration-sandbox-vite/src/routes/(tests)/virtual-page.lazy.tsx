
import { ScrollBlock } from '../-components/scroll-block'

export const Route = createLazyFileRoute({
  component: Component,
})

function Component() {
  return (
    <div class="p-2">
      <h3>virtual-page</h3>
      <hr />
      <ScrollBlock />
    </div>
  )
}
