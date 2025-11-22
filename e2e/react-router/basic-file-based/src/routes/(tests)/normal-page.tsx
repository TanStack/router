import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(tests)/normal-page')({
  component: NormalPage,
})

function NormalPage() {
  return (
    <div className="p-2">
      <h3>Normal Page</h3>

      {/* Add the link that the test is looking for */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/lazy-page" className="header-link">
          Head-/lazy-page
        </Link>
      </div>

      <div style={{ height: '200vh' }}>
        Scroll down to see the target element
      </div>

      <div
        id="at-the-bottom"
        data-testid="at-the-bottom"
        style={{
          height: '100px',
          background: '#f0f0f0',
          border: '1px solid #ccc',
          padding: '1rem',
          marginTop: '2rem',
        }}
      >
        This is the target element at the bottom of the page
      </div>
    </div>
  )
}
