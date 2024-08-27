import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-2 grid gap-2">
      <h3>Welcome Home!</h3>
      <div className="border p-2">
        <h4>Normal page tests</h4>
        <p>
          <Link to="/normal-page" hash="at-the-bottom">
            /normal-page#at-the-bottom
          </Link>
        </p>
      </div>
      <div className="border p-2">
        <h4>Lazy page tests</h4>
        <p>
          <Link to="/lazy-page" hash="at-the-bottom">
            /lazy-page#at-the-bottom
          </Link>
        </p>
      </div>
      <div className="border p-2">
        <h4>Virtual page tests</h4>
        <p>
          <Link to="/virtual-page" hash="at-the-bottom">
            /virtual-page#at-the-bottom
          </Link>
        </p>
      </div>
    </div>
  )
}
