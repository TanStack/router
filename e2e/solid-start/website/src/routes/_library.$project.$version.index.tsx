import { Link } from '@tanstack/solid-router'

export const Route = createFileRoute({
  component: Page,
})

function Page() {
  const params = Route.useParams()

  return (
    <div>
      <h1 class="text-2xl mb-2" data-testid="landing-page-heading">
        {params().project} landing page
      </h1>
      <p data-testid="landing-page-version">version: {params().version}</p>
      <p>
        <Link from="/$project/$version" to="./docs">
          Get started with our documentation.
        </Link>
      </p>
    </div>
  )
}
