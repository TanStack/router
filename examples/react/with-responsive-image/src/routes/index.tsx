import { createFileRoute } from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import visual from '../images/splash-dark.png?w=300;600&responsive'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <>
      <ResponsiveImage src={visual} width={300} />
      <section className="intro">
        <h1>Welcome to this TanStack Router + ResponsiveImage demo</h1>
        <ul>
          <li>
            <a
              className="App-link"
              href="https://tanstack.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn TanStack
            </a>
          </li>
          <li>
            <a
              className="App-link"
              href="https://responsive-image.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn ResponsiveImage
            </a>
          </li>
        </ul>
      </section>
    </>
  )
}
