import { createFileRoute } from '@tanstack/react-router'
import { moduleIndex } from '../moduleIndex.gen'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <>
      <h1>Modules</h1>
      <p className="lead">
        {moduleIndex.length} generated feature modules, each its own package
        with its own routes, server functions and middleware.
      </p>
      <ul className="grid">
        {moduleIndex.map(({ name, link }) => (
          <li key={name}>{link}</li>
        ))}
      </ul>
    </>
  )
}
