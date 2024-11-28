import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-2 grid gap-2">
      <h3>Welcome Home!</h3>
      <p>
        The are the links to be tested when navigating away from the index page.
        Otherwise known as NOT first-load tests, rather known as navigation
        tests.
      </p>
      {(
        [
          '/normal-page',
          '/lazy-page',
          '/virtual-page',
          '/lazy-with-loader-page',
        ] as const
      ).map((href, i) => (
        <div key={`index-page-tests-${href}-${i}`} className="border p-2">
          <h4>{href} tests</h4>
          <p>
            <Link to={href} hash="at-the-bottom">
              {href}#at-the-bottom
            </Link>
          </p>
        </div>
      ))}
    </div>
  )
}
