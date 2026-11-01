/**
 * `/`: a server fn whose handler returns `handler`, the loader and the page
 * calling it, the page's text `text` and a counter (component state). The
 * call button shows `text` and the answer, so a call from an edited
 * component is told apart from the answer the kept state shows.
 */
export const route = (
  handler: string,
  text: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const getLabel = createServerFn().handler(() => '${handler}')
export const Route = createFileRoute('/')({
  loader: () => getLabel(),
  component: Page,
})
function Page() {
  const label = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [count, setCount] = useState(0)
  return (
    <main>
      <p data-testid="text">${text} {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => getLabel().then((answer) => setCalled('${text} ' + answer))}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
`
