import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { useState } from 'react'
import styles from './coLocatedCssModule.module.css'

// Same co-location as ./co-located.tsx, plus a CSS module import. The upstream
// guard decides whether to suppress client HMR by classifying importers as CSS
// vs non-CSS, so a route that has both kinds of importer is the case most likely
// to regress -- in either direction: the component must still Fast Refresh, and
// a CSS-only edit must still hot-swap without a full reload.
const getServerContent = createServerFn({ method: 'GET' }).handler(async () => {
  return renderServerComponent(
    <p data-testid="css-module-server-content">server-rendered content</p>,
  )
})

export const Route = createFileRoute('/co-located-css-module')({
  loader: () => getServerContent(),
  component: CoLocatedCssModuleComponent,
})

function CoLocatedCssModuleComponent() {
  const Server = Route.useLoaderData()
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1 className={styles.marker} data-testid="css-module-marker">
        css-module-baseline
      </h1>

      <p data-testid="css-module-count">Count: {count}</p>
      <button
        type="button"
        data-testid="css-module-increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>

      {Server}
    </main>
  )
}
