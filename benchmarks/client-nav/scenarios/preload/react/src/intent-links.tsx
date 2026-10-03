import {
  Link,
  RouterContextProvider,
  createRouter,
} from '@tanstack/react-router'
import { createMemoryHistory } from '@tanstack/history'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'

const sections = Array.from({ length: 200 }, (_, index) => String(index))

/** Mount a link collection that is removed before the user hovers any link. */
export function mountIntentLinks(container: HTMLElement) {
  const history = createMemoryHistory()
  const router = createRouter({ routeTree, history, defaultPreload: 'intent' })
  const root = createRoot(container)
  flushSync(() => {
    root.render(
      <RouterContextProvider router={router}>
        {sections.map((section) => (
          <Link key={section} to="/sections/$section" params={{ section }}>
            Section {section}
          </Link>
        ))}
      </RouterContextProvider>,
    )
  })
  return () => {
    root.unmount()
    history.destroy()
  }
}
