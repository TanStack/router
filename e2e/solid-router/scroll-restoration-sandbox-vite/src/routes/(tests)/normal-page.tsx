import { ScrollBlock } from '../-components/scroll-block'

export const Route = createFileRoute({
  component: Component,
})

function Component() {
  return (
    <div class="p-2">
      <h3>normal-page</h3>
      <hr />
      <ScrollBlock />
    </div>
  )
}
