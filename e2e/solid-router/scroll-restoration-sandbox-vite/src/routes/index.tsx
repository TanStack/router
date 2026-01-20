import { createFileRoute } from '@tanstack/solid-router'
import { Link, linkOptions, useNavigate } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const navigate = useNavigate()

  return (
    <div class="p-2 grid gap-2">
      <h3>Welcome Home!</h3>
      <p>
        The are the links to be tested when navigating away from the index page.
        Otherwise known as NOT first-load tests, rather known as navigation
        tests.
      </p>
      {(
        [
          linkOptions({ to: '/normal-page' }),
          linkOptions({ to: '/lazy-page' }),
          linkOptions({ to: '/virtual-page' }),
          linkOptions({ to: '/lazy-with-loader-page' }),
          linkOptions({ to: '/page-with-search', search: { where: 'footer' } }),
        ] as const
      ).map((options, i) => (
        <div class="border p-2">
          <h4>{options.to} tests</h4>
          <p>
            <Link
              {...options}
              hash="at-the-bottom"
              data-testid={`index-${options.to}-hash-link`}
            >
              {options.to}#at-the-bottom
            </Link>
          </p>
        </div>
      ))}
      <div class="border p-2">
        <h4>scrollRestorationBehavior tests (Link)</h4>
        <p>
          <Link
            to="/normal-page"
            scrollRestorationBehavior="smooth"
            data-testid="smooth-scroll-link"
          >
            /normal-page (smooth scroll)
          </Link>
        </p>
        <p>
          <Link to="/lazy-page" data-testid="default-scroll-link">
            /lazy-page (default scroll)
          </Link>
        </p>
      </div>
      <div class="border p-2">
        <h4>scrollRestorationBehavior tests (navigate)</h4>
        <p>
          <button
            type="button"
            data-testid="smooth-scroll-navigate-btn"
            onClick={() =>
              navigate({
                to: '/normal-page',
                scrollRestorationBehavior: 'smooth',
              })
            }
          >
            navigate to /normal-page (smooth scroll)
          </button>
        </p>
        <p>
          <button
            type="button"
            data-testid="default-scroll-navigate-btn"
            onClick={() => navigate({ to: '/lazy-page' })}
          >
            navigate to /lazy-page (default scroll)
          </button>
        </p>
      </div>
    </div>
  )
}
