import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <>
      <div>
        <h2>SSR</h2>
        <Link
          data-testid="ssr-data-only-link"
          to="/ssr/data-only"
          reloadDocument={true}
        >
          Data Only
        </Link>
        <br />
        <Link
          data-testid="ssr-stream-link"
          to="/ssr/stream"
          reloadDocument={true}
        >
          Stream
        </Link>
      </div>
      <div>
        <h2>Server Functions</h2>
        <Link
          data-testid="server-function-custom-error-link"
          to="/server-function/custom-error"
          reloadDocument={true}
        >
          Custom Error Serialization
        </Link>
      </div>
    </>
  )
}
