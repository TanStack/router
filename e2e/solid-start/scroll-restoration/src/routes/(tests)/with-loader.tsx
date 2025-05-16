import { sleep } from 'src/utils/posts'
import { ScrollBlock } from '../-components/scroll-block'

export const Route = createFileRoute({
  loader: async () => {
    await sleep(1000)
    return { foo: 'bar' }
  },
  component: Component,
})

function Component() {
  return (
    <div class="p-2">
      <h3>lazy-with-loader-page</h3>
      <hr />
      <ScrollBlock />
    </div>
  )
}
