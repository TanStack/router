import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <>
      <Link data-testid="data-only-link" to="/data-only" reloadDocument={true}>
        Data Only
      </Link>
      <br />
      <Link data-testid="stream-link" to="/stream" reloadDocument={true}>
        Stream
      </Link>
    </>
  )
}
