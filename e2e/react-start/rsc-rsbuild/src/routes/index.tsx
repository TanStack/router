import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div>
      <h1 data-testid="home-heading">Welcome Home</h1>
      <p data-testid="home-message">This is the rsbuild RSC e2e test app.</p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Link to="/rsc-basic">RSC Basic</Link>
        <Link to="/rsc-css-modules">CSS Modules</Link>
        <Link to="/rsc-css-conditional">CSS Conditional</Link>
        <Link to="/rsc-query-no-loader-css">Render-Suspended CSS</Link>
      </div>
    </div>
  )
}
